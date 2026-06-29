import { createNativeDriver } from './native-driver.js';
export { resolveNativeBinaryPath } from './native-binary.js';

const macosDriver = createNativeDriver('darwin');
const windowsDriver = createNativeDriver('win32');

import type {
  ActiveCapture,
  AudioCaptureDriver,
  AudioDeviceList,
  AudioPermissionsStatus,
  NativeCaptureEventListener,
  StartCaptureInput,
  StopCaptureResult,
} from './types.js';

const DRIVERS: Partial<Record<NodeJS.Platform, AudioCaptureDriver>> = {
  darwin: macosDriver,
  win32: windowsDriver,
};

type AudioCaptureHandle = {
  start: (input: StartCaptureInput) => Promise<void>;
  stop: () => Promise<StopCaptureResult | null>;
  getActive: () => ActiveCapture | null;
  listDevices: () => Promise<AudioDeviceList>;
  checkPermissions: () => Promise<AudioPermissionsStatus>;
  primeSystemAudio: () => Promise<AudioPermissionsStatus>;
  onEvent: (listener: NativeCaptureEventListener) => void;
};

export function createAudioCaptureHandle(
  platform: NodeJS.Platform = process.platform,
): AudioCaptureHandle {
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

    async listDevices(): Promise<AudioDeviceList> {
      return driver.listDevices();
    },

    async checkPermissions(): Promise<AudioPermissionsStatus> {
      return driver.checkPermissions();
    },

    async primeSystemAudio(): Promise<AudioPermissionsStatus> {
      return driver.primeSystemAudio();
    },

    onEvent(listener: NativeCaptureEventListener): void {
      active?.controller.onEvent(listener);
    },
  };
}
