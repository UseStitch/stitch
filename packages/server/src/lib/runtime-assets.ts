import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function getServerDir(): string {
  return process.env['STITCH_SERVER_DIR'] ?? path.dirname(process.execPath);
}

export function resolveRuntimeAssetPath(sourceUrl: URL, bundledRelativePath: string): string {
  const sourcePath = fileURLToPath(sourceUrl);
  if (existsSync(sourcePath)) {
    return sourcePath;
  }

  return path.join(getServerDir(), 'server-assets', bundledRelativePath);
}
