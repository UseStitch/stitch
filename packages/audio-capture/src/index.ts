import type { RecordingDevicesPayload, RecordingPermissionsPayload } from '@stitch/shared/ipc/types';

import { checkPermissions, listDevices, primeSystemAudio, startCapture, stopCapture } from './native.js';

import type {
  ActiveCapture,
  CaptureEvent,
  CaptureEventListener,
  StartCaptureInput,
  StopCaptureResult,
} from './types.js';

const SUPPORTED_PLATFORMS: ReadonlySet<NodeJS.Platform> = new Set(['darwin', 'win32']);

type AudioCaptureHandle = {
  start: (input: StartCaptureInput) => Promise<void>;
  stop: () => Promise<StopCaptureResult | null>;
  getActive: () => ActiveCapture | null;
  listDevices: () => Promise<RecordingDevicesPayload>;
  checkPermissions: () => Promise<RecordingPermissionsPayload>;
  primeSystemAudio: () => Promise<RecordingPermissionsPayload>;
  onEvent: (listener: CaptureEventListener) => void;
};

export function createAudioCaptureHandle(platform: NodeJS.Platform = process.platform): AudioCaptureHandle {
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error(`Audio capture is not supported on ${platform}`);
  }

  let active: ActiveCapture | null = null;
  let listener: CaptureEventListener | null = null;

  return {
    async start(input): Promise<void> {
      if (active) {
        throw new Error('Audio capture is already running');
      }

      startCapture(input, (event: CaptureEvent) => {
        listener?.(event);
      });
      active = { startedAt: Date.now() };
    },

    async stop(): Promise<StopCaptureResult | null> {
      if (!active) {
        return null;
      }

      active = null;
      const result = stopCapture();
      listener = null;
      return result;
    },

    getActive(): ActiveCapture | null {
      return active;
    },

    async listDevices(): Promise<RecordingDevicesPayload> {
      return listDevices();
    },

    async checkPermissions(): Promise<RecordingPermissionsPayload> {
      return checkPermissions();
    },

    async primeSystemAudio(): Promise<RecordingPermissionsPayload> {
      return primeSystemAudio();
    },

    onEvent(nextListener: CaptureEventListener): void {
      listener = nextListener;
    },
  };
}
