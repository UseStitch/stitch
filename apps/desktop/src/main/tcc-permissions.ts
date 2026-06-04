import { app } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// With adhoc code signing, macOS ties TCC permissions to the exact code signature hash.
// After an app update the hash changes but old TCC entries remain, causing permissions
// to appear granted in System Settings while being silently rejected at runtime.
// This detects version changes and resets TCC so macOS will re-prompt.
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

  for (const service of ['Microphone', 'ScreenCapture']) {
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
