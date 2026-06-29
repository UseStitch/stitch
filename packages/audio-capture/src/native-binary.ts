import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function getBinaryName(): string {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return `stitch-audio-capture${suffix}`;
}

function getRepoCandidatePaths(): string[] {
  const filePath = fileURLToPath(import.meta.url);
  const sourceDir = path.dirname(filePath);
  const binaryName = getBinaryName();
  return [
    path.join(sourceDir, '../../../native/target/release', binaryName),
    path.join(sourceDir, '../../../native/target/debug', binaryName),
    path.join(sourceDir, '../../../../native/target/release', binaryName),
    path.join(sourceDir, '../../../../native/target/debug', binaryName),
    path.resolve(process.cwd(), '../../native/target/release', binaryName),
    path.resolve(process.cwd(), '../../native/target/debug', binaryName),
  ];
}

function getPackagedCandidatePaths(): string[] {
  const binaryName = getBinaryName();
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (!resourcesPath) {
    return [];
  }

  return [
    path.join(resourcesPath, binaryName),
    path.join(resourcesPath, 'audio-capture', binaryName),
  ];
}

export function resolveNativeBinaryPath(): string {
  const overridePath = process.env.STITCH_AUDIO_CAPTURE_BIN;
  if (overridePath) {
    if (!existsSync(overridePath)) {
      throw new Error(`STITCH_AUDIO_CAPTURE_BIN points to a missing file: ${overridePath}`);
    }
    return overridePath;
  }

  const candidates = [...getPackagedCandidatePaths(), ...getRepoCandidatePaths()];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return getBinaryName();
}
