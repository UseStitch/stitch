import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type NativeBinary = 'capture' | 'meeting-watch';

function getBinaryName(binary: NativeBinary): string {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  if (binary === 'meeting-watch') {
    return `stitch-meeting-watch${suffix}`;
  }
  return `stitch-audio-capture${suffix}`;
}

function getRepoCandidatePaths(binary: NativeBinary): string[] {
  const filePath = fileURLToPath(import.meta.url);
  const sourceDir = path.dirname(filePath);
  const binaryName = getBinaryName(binary);
  return [
    path.join(sourceDir, '../../../native/target/release', binaryName),
    path.join(sourceDir, '../../../native/target/debug', binaryName),
    path.join(sourceDir, '../../../../native/target/release', binaryName),
    path.join(sourceDir, '../../../../native/target/debug', binaryName),
    path.resolve(process.cwd(), '../../native/target/release', binaryName),
    path.resolve(process.cwd(), '../../native/target/debug', binaryName),
  ];
}

function getPackagedCandidatePaths(binary: NativeBinary): string[] {
  const binaryName = getBinaryName(binary);
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (!resourcesPath) {
    return [];
  }

  return [
    path.join(resourcesPath, binaryName),
    path.join(resourcesPath, 'audio-capture', binaryName),
  ];
}

function resolveBinary(binary: NativeBinary, overrideEnv: string): string {
  const overridePath = process.env[overrideEnv];
  if (overridePath) {
    if (!existsSync(overridePath)) {
      throw new Error(`${overrideEnv} points to a missing file: ${overridePath}`);
    }
    return overridePath;
  }

  const candidates = [...getPackagedCandidatePaths(binary), ...getRepoCandidatePaths(binary)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return getBinaryName(binary);
}

export function resolveNativeBinaryPath(): string {
  return resolveBinary('capture', 'STITCH_AUDIO_CAPTURE_BIN');
}

export function resolveMeetingWatcherBinaryPath(): string {
  return resolveBinary('meeting-watch', 'STITCH_MEETING_WATCH_BIN');
}
