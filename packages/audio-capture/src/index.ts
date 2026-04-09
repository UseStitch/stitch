import type { ActiveCapture, AudioCaptureDriver, StartCaptureInput, StopCaptureResult } from './types.js';
import { macosDriver } from './macos.js';
import { windowsDriver } from './windows.js';

const DRIVERS: Record<NodeJS.Platform, AudioCaptureDriver | undefined> = {
  aix: undefined,
  android: undefined,
  darwin: macosDriver,
  freebsd: undefined,
  haiku: undefined,
  linux: undefined,
  openbsd: undefined,
  sunos: undefined,
  win32: windowsDriver,
  cygwin: undefined,
  netbsd: undefined,
};

export type AudioCaptureHandle = {
  start: (input: StartCaptureInput) => Promise<void>;
  stop: () => Promise<StopCaptureResult | null>;
  getActive: () => ActiveCapture | null;
};

export function createAudioCaptureHandle(platform: NodeJS.Platform = process.platform): AudioCaptureHandle {
  const driver = DRIVERS[platform];
  if (!driver) {
    throw new Error(`Audio capture is not supported on ${platform}`);
  }

  let active: ActiveCapture | null = null;

  return {
    async start(input): Promise<void> {
      if (active) {
        throw new Error('Audio capture is already running');
      }
      active = await driver.start(input);
    },

    async stop(): Promise<StopCaptureResult | null> {
      if (!active) {
        return null;
      }

      const current = active;
      active = null;
      return driver.stop(current);
    },

    getActive(): ActiveCapture | null {
      return active;
    },
  };
}

export type { StartCaptureInput, StopCaptureResult } from './types.js';
