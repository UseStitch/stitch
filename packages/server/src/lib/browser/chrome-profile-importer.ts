import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { getBrowserManager } from '@/lib/browser/browser-manager.js';
import * as Log from '@/lib/log.js';
import { getBrowserProfilePath } from '@/lib/paths.js';

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

const EXCLUDED_DIRS = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'Service Worker',
  'ShaderCache',
  'GrShaderCache',
  'GraphiteDawnCache',
  'component_crx_cache',
  'extensions_crx_cache',
  'Crashpad',
];

const EXCLUDED_FILE_PATTERNS = ['*.tmp', 'BrowserMetrics*'];

async function copyProfileWindows(sourceDir: string, targetDir: string): Promise<void> {
  const xd = EXCLUDED_DIRS.map((d) => `"${d}"`).join(' ');
  const xf = EXCLUDED_FILE_PATTERNS.map((f) => `"${f}"`).join(' ');
  const { stderr } = await execAsync(
    `robocopy "${sourceDir}" "${targetDir}" /E /XD ${xd} /XF ${xf} /NFL /NDL /NJH /NJS /NC /NS /NP`,
    { timeout: 120_000 },
  ).catch((error: { code?: number; stderr?: string }) => {
    // robocopy exit codes 0-7 indicate success (bitmask of what was copied)
    // Exit codes >= 8 indicate actual failures
    if (typeof error.code === 'number' && error.code < 8) {
      return { stderr: '' };
    }
    throw new Error(`robocopy failed (exit ${error.code}): ${error.stderr ?? 'unknown error'}`);
  });
  if (stderr) log.warn({ stderr }, 'robocopy warnings');
}

async function copyProfileUnix(sourceDir: string, targetDir: string): Promise<void> {
  const excludes = [
    ...EXCLUDED_DIRS.map((d) => `--exclude='${d}'`),
    ...EXCLUDED_FILE_PATTERNS.map((f) => `--exclude='${f}'`),
  ].join(' ');

  try {
    await execAsync(`rsync -a ${excludes} "${sourceDir}/" "${targetDir}/"`, {
      timeout: 120_000,
    });
  } catch {
    log.info('rsync not available, falling back to cp');
    await execAsync(`cp -R "${sourceDir}/." "${targetDir}/"`, { timeout: 120_000 });
  }
}

async function copyProfile(sourceDir: string, targetDir: string): Promise<void> {
  if (process.platform === 'win32') {
    return copyProfileWindows(sourceDir, targetDir);
  }
  return copyProfileUnix(sourceDir, targetDir);
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

  const targetDir = getBrowserProfilePath('chrome', profileId);

  // Wipe existing Stitch browser profile for this browser/profile combo
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
