import { createMacosMeetingDetector } from './meeting-detection/macos.js';
import { createWindowsMeetingDetector } from './meeting-detection/windows.js';
import { createNativeDriver } from './native-driver.js';
export { resolveMeetingWatcherBinaryPath, resolveNativeBinaryPath } from './native-binary.js';

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
import type {
  MeetingDetection,
  MeetingDetectionListener,
  MeetingDetectionOptions,
  MeetingDetector,
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

    onEvent(listener: NativeCaptureEventListener): void {
      active?.controller.onEvent(listener);
    },
  };
}

export function createMeetingDetector(
  platform: NodeJS.Platform = process.platform,
  options: MeetingDetectionOptions = {},
): MeetingDetector {
  if (platform === 'darwin') {
    return createMacosMeetingDetector(options);
  }

  if (platform === 'win32') {
    return createWindowsMeetingDetector(options);
  }

  return {
    start(): void {},
    stop(): void {},
    subscribe(_listener: MeetingDetectionListener): () => void {
      return () => {};
    },
    getActive(): MeetingDetection | null {
      return null;
    },
  };
}
