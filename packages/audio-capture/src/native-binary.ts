import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function getBinaryName(): string {
  return process.platform === 'win32' ? 'stitch-audio-capture.exe' : 'stitch-audio-capture';
}

function getRepoCandidatePaths(): string[] {
  const filePath = fileURLToPath(import.meta.url);
  const sourceDir = path.dirname(filePath);
  const binaryName = getBinaryName();
  return [
    path.join(sourceDir, '../../audio-native/target/release', binaryName),
    path.join(sourceDir, '../../audio-native/target/debug', binaryName),
  ];
}

function getPackagedCandidatePaths(): string[] {
  const binaryName = getBinaryName();
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (!resourcesPath) {
    return [];
  }

  return [path.join(resourcesPath, binaryName), path.join(resourcesPath, 'audio-capture', binaryName)];
}

export function resolveNativeBinaryPath(): string {
  if (process.env.STITCH_AUDIO_CAPTURE_BIN) {
    if (!existsSync(process.env.STITCH_AUDIO_CAPTURE_BIN)) {
      throw new Error(
        `STITCH_AUDIO_CAPTURE_BIN points to a missing file: ${process.env.STITCH_AUDIO_CAPTURE_BIN}`,
      );
    }
    return process.env.STITCH_AUDIO_CAPTURE_BIN;
  }

  const candidates = [...getPackagedCandidatePaths(), ...getRepoCandidatePaths()];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return getBinaryName();
}
