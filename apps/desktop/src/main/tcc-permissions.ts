import { app } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function resetTccPermissionsIfVersionChanged(): Promise<boolean> {
  if (process.platform !== 'darwin' || !app.isPackaged) return false;

  const versionFile = join(app.getPath('userData'), '.last-tcc-version');
  const currentVersion = app.getVersion();

  try {
    const lastVersion = (await readFile(versionFile, 'utf-8')).trim();
    if (lastVersion === currentVersion) return false;
  } catch {
    // File doesn't exist — first run or upgrade from before this logic
  }

  const { execSync } = await import('node:child_process');
  const bundleId = 'com.stitch.desktop';

  for (const service of ['Microphone', 'ScreenCapture', 'AudioCapture']) {
    try {
      execSync(`tccutil reset ${service} ${bundleId}`, { timeout: 5_000 });
    } catch {
      // tccutil may fail if no entry exists
    }
  }

  await mkdir(join(app.getPath('userData')), { recursive: true });
  await writeFile(versionFile, currentVersion, 'utf-8');

  return true;
}
