import { macosDriver } from './macos.js';
import { createMacosMeetingDetector } from './meeting-detection/macos.js';
import { createNoopMeetingDetector } from './meeting-detection/noop.js';
import { createWindowsMeetingDetector } from './meeting-detection/windows.js';
import { windowsDriver } from './windows.js';

import type {
  ActiveCapture,
  AudioCaptureDriver,
  AudioDeviceList,
  AudioPermissionsStatus,
  NativeCaptureEventListener,
  StartCaptureInput,
  StopCaptureResult,
} from './types.js';
import type { MeetingDetectionOptions, MeetingDetector } from './types.js';

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

  return createNoopMeetingDetector();
}

export type {
  AudioDeviceList,
  AudioPermissionsStatus,
  CaptureMode,
  NativeCaptureEventListener,
  PermissionState,
  StartCaptureInput,
  StopCaptureResult,
  MeetingDetection,
  MeetingDetectionEvent,
  MeetingDetectionListener,
  MeetingDetectionOptions,
  MeetingDetector,
} from './types.js';
