import { app } from 'electron';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BUNDLE_ID = 'com.stitch.desktop';

// Developer-ID-signed builds key TCC grants on the stable team identity, so they
// survive upgrades. Ad-hoc builds key on the cdhash, which churns every build.
function isDeveloperIdSigned(): boolean {
  try {
    execFileSync(
      'codesign',
      ['--verify', '--test-requirement=anchor apple generic', app.getPath('exe')],
      { timeout: 5_000, stdio: 'ignore' },
    );
    return true;
  } catch {
    return false;
  }
}

export async function resetTccPermissionsIfVersionChanged(): Promise<boolean> {
  if (process.platform !== 'darwin' || !app.isPackaged) return false;

  // Resetting a signed build would force users to re-approve on every update.
  if (isDeveloperIdSigned()) return false;

  const versionFile = join(app.getPath('userData'), '.last-tcc-version');
  const currentVersion = app.getVersion();

  try {
    const lastVersion = (await readFile(versionFile, 'utf-8')).trim();
    if (lastVersion === currentVersion) return false;
  } catch {
    // File doesn't exist — first run or upgrade from before this logic
  }

  for (const service of ['Microphone', 'ScreenCapture', 'AudioCapture']) {
    try {
      execFileSync('tccutil', ['reset', service, BUNDLE_ID], { timeout: 5_000 });
    } catch {
      // tccutil may fail if no entry exists
    }
  }

  await mkdir(join(app.getPath('userData')), { recursive: true });
  await writeFile(versionFile, currentVersion, 'utf-8');

  return true;
}
