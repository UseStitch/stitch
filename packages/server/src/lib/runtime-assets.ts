import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveRuntimeAssetPath(sourceUrl: URL, bundledRelativePath: string): string {
  const sourcePath = fileURLToPath(sourceUrl);
  if (existsSync(sourcePath)) {
    return sourcePath;
  }

  return path.join(path.dirname(process.execPath), 'server-assets', bundledRelativePath);
}
