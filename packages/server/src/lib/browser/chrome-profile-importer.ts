import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { getBrowserManager } from '@/lib/browser/browser-manager.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const execAsync = promisify(exec);
const log = Log.create({ service: 'browser.profile-importer' });

type ChromeProfile = {
  id: string;
  name: string;
  email: string;
};

function getChromeUserDataDir(): string | null {
  const platform = process.platform;
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  }
  if (platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'];
    return localAppData ? path.join(localAppData, 'Google', 'Chrome', 'User Data') : null;
  }
  return path.join(os.homedir(), '.config', 'google-chrome');
}

export async function listChromeProfiles(): Promise<ChromeProfile[]> {
  const chromeDir = getChromeUserDataDir();
  if (!chromeDir) return [];

  const localStatePath = path.join(chromeDir, 'Local State');
  try {
    const raw = await fs.readFile(localStatePath, 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    const profileSection = data['profile'] as Record<string, unknown> | undefined;
    const infoCache = profileSection?.['info_cache'] as Record<string, Record<string, unknown>> | undefined;

    if (!infoCache) return [];

    const profiles: ChromeProfile[] = [];
    for (const [id, info] of Object.entries(infoCache)) {
      profiles.push({
        id,
        name: (info['name'] as string) ?? id,
        email: (info['gaia_name'] as string) ?? '',
      });
    }

    return profiles;
  } catch {
    log.info({ chromeDir }, 'Could not read Chrome Local State');
    return [];
  }
}

async function removeLockFiles(targetDir: string): Promise<void> {
  const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
  await Promise.all(
    lockFiles.map(async (name) => {
      await fs.unlink(path.join(targetDir, name)).catch(() => {});
    }),
  );
}

async function removeSessionRestoreFiles(profileDir: string): Promise<void> {
  const dirsToRemove = ['Sessions', 'Session Storage'];
  const filesToRemove = ['Current Session', 'Current Tabs', 'Last Session', 'Last Tabs'];

  await Promise.all([
    ...dirsToRemove.map((dir) =>
      fs.rm(path.join(profileDir, dir), { recursive: true, force: true }).catch(() => {}),
    ),
    ...filesToRemove.map((file) => fs.rm(path.join(profileDir, file), { force: true }).catch(() => {})),
  ]);
}

async function disableSessionRestore(prefsPath: string): Promise<void> {
  try {
    const raw = await fs.readFile(prefsPath, 'utf-8');
    const prefs = JSON.parse(raw) as Record<string, unknown>;

    const session = (prefs['session'] ?? {}) as Record<string, unknown>;
    session['restore_on_startup'] = 5;
    prefs['session'] = session;

    const profile = (prefs['profile'] ?? {}) as Record<string, unknown>;
    profile['exit_type'] = 'Normal';
    prefs['profile'] = profile;

    await fs.writeFile(prefsPath, JSON.stringify(prefs));
  } catch {
    // Preferences file might not exist or be malformed
  }
}

async function copyProfile(sourceDir: string, targetDir: string): Promise<void> {
  if (process.platform === 'win32') {
    await execAsync(
      `robocopy "${sourceDir}" "${targetDir}" /E /XD "Cache" "Code Cache" "GPUCache" "Service Worker" "ShaderCache" "GrShaderCache" "component_crx_cache" "extensions_crx_cache" /XF "*.tmp" /NFL /NDL /NJH /NJS /NC /NS /NP`,
      { timeout: 120_000 },
    ).catch(() => {
      // robocopy returns non-zero exit codes for success
    });
    return;
  }

  try {
    await execAsync(
      `rsync -a \
        --exclude='Cache' \
        --exclude='Code Cache' \
        --exclude='GPUCache' \
        --exclude='Service Worker' \
        --exclude='ShaderCache' \
        --exclude='GrShaderCache' \
        --exclude='GraphiteDawnCache' \
        --exclude='component_crx_cache' \
        --exclude='extensions_crx_cache' \
        --exclude='BrowserMetrics*' \
        --exclude='Crashpad' \
        --exclude='*.tmp' \
        "${sourceDir}/" "${targetDir}/"`,
      { timeout: 120_000 },
    );
  } catch {
    log.info('rsync not available, falling back to cp');
    await execAsync(`cp -R "${sourceDir}/." "${targetDir}/"`, { timeout: 120_000 });
  }
}

export async function importChromeProfile(profileId: string): Promise<void> {
  const chromeDir = getChromeUserDataDir();
  if (!chromeDir) {
    throw new Error('Could not find Chrome user data directory. Is Google Chrome installed?');
  }

  const profileDir = path.join(chromeDir, profileId);
  try {
    await fs.access(profileDir);
  } catch {
    throw new Error(
      `Chrome profile "${profileId}" not found at ${profileDir}.`,
    );
  }

  log.info({ profileId, source: chromeDir }, 'Starting Chrome profile import');

  // Close any running Stitch browser
  const browser = getBrowserManager();
  await browser.close();

  const targetDir = PATHS.dirPaths.browserProfile;

  // Wipe existing Stitch browser profile
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });

  // Copy the entire Chrome user data dir (contains Local State, profile dirs, etc.)
  await copyProfile(chromeDir, targetDir);

  // Clean up the copy
  await removeLockFiles(targetDir);

  // Clean session restore for the specific profile that was requested
  const targetProfileDir = path.join(targetDir, profileId);
  await removeSessionRestoreFiles(targetProfileDir);
  await disableSessionRestore(path.join(targetProfileDir, 'Preferences'));

  // Also clean the Default profile if it's different
  if (profileId !== 'Default') {
    const defaultDir = path.join(targetDir, 'Default');
    await removeSessionRestoreFiles(defaultDir);
    await disableSessionRestore(path.join(defaultDir, 'Preferences'));
  }

  log.info({ profileId, target: targetDir }, 'Chrome profile import complete');
}
