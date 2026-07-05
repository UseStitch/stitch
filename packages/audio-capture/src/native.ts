import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  AudioChunkEncoding,
  AudioChunkSource,
  AudioDeviceList,
  AudioPermissionsStatus,
  CaptureEvent,
  CaptureEventListener,
  StartCaptureInput,
  StopCaptureResult,
} from './types.js';

type NativeCaptureEvent = {
  kind: string;
  source?: string;
  pcm?: Buffer;
  sampleRateHz?: number;
  numSamples?: number;
  encoding?: string;
  deviceKind?: string;
  deviceName?: string;
  code?: string;
  message?: string;
};

type NativeStartInput = {
  sampleRateHz: number;
  encoding: string;
  micDeviceId?: string;
  speakerDeviceId?: string;
  echoCancellation?: boolean;
};

type NativeStopResult = { endedAt: number; durationMs: number; warnings: string[] };

type NativeAddon = {
  startCapture: (input: NativeStartInput, callback: (err: Error | null, event: NativeCaptureEvent) => void) => void;
  stopCapture: (callback: (err: Error | null, event: NativeCaptureEvent) => void) => NativeStopResult | null;
  listDevices: () => AudioDeviceList;
  checkPermissions: () => AudioPermissionsStatus;
  primeSystemAudio: () => AudioPermissionsStatus;
};

const require = createRequire(import.meta.url);

const BINDING_FILE = 'binding.cjs';

function resolveBindingPath(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const packagedBinding = path.join(resourcesPath, 'audio-capture', BINDING_FILE);
    if (existsSync(packagedBinding)) {
      return packagedBinding;
    }
  }

  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(sourceDir, '../native', BINDING_FILE),
    path.join(sourceDir, '../../../../packages/audio-capture/native', BINDING_FILE),
    path.join(sourceDir, '../../../../../packages/audio-capture/native', BINDING_FILE),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

// oxlint-disable-next-line no-dynamic-require -- the binding path is resolved at runtime (dev vs packaged resources)
const native = require(resolveBindingPath()) as NativeAddon;

function normalizeEvent(event: NativeCaptureEvent): CaptureEvent | null {
  switch (event.kind) {
    case 'audioChunk':
      if (!event.pcm || !event.source) return null;
      return {
        type: 'audioChunk',
        source: event.source as AudioChunkSource,
        pcm: event.pcm,
        sampleRateHz: event.sampleRateHz ?? 0,
        numSamples: event.numSamples ?? 0,
        encoding: (event.encoding ?? 'f32le') as AudioChunkEncoding,
      };
    case 'deviceChanged':
      return {
        type: 'deviceChanged',
        kind: (event.deviceKind ?? 'input') as 'input' | 'output',
        deviceName: event.deviceName ?? null,
      };
    case 'warning':
      return { type: 'warning', code: event.code ?? 'unknown', message: event.message ?? '' };
    default:
      return null;
  }
}

export function startCapture(input: StartCaptureInput, listener: CaptureEventListener): void {
  native.startCapture(
    {
      sampleRateHz: input.sampleRateHz,
      encoding: input.encoding,
      micDeviceId: input.micDeviceId ?? undefined,
      speakerDeviceId: input.speakerDeviceId ?? undefined,
      echoCancellation: input.echoCancellation,
    },
    (err, event) => {
      if (err) {
        listener({ type: 'warning', code: 'native_callback_error', message: err.message });
        return;
      }
      const normalized = normalizeEvent(event);
      if (normalized) listener(normalized);
    },
  );
}

export function stopCapture(): StopCaptureResult | null {
  return native.stopCapture(() => {});
}

export function listDevices(): AudioDeviceList {
  return native.listDevices();
}

export function checkPermissions(): AudioPermissionsStatus {
  return native.checkPermissions();
}

export function primeSystemAudio(): AudioPermissionsStatus {
  return native.primeSystemAudio();
}
