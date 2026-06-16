import { spawn } from 'node:child_process';

import { resolveNativeBinaryPath } from './native-binary.js';
import { createJsonLineBuffer } from './stream-json.js';

import type {
  ActiveCapture,
  AudioCaptureDriver,
  AudioDeviceList,
  AudioPermissionsStatus,
  CapturePlatform,
  NativeCaptureCommand,
  NativeCaptureController,
  NativeCaptureDeviceListEvent,
  NativeCaptureErrorEvent,
  NativeCaptureEvent,
  NativeCaptureEventListener,
  NativeCapturePermissionsStatusEvent,
  NativeCaptureStoppedEvent,
  StartCaptureInput,
  StopCaptureResult,
} from './types.js';

const START_TIMEOUT_MS = 10_000;
const STOP_TIMEOUT_MS = 10_000;
const ONE_SHOT_TIMEOUT_MS = 5_000;
// Native side polls up to 10s; extra 5s is buffer for process startup.
const PRIME_SYSTEM_AUDIO_TIMEOUT_MS = 15_000;

function createController(processHandle: ActiveCapture['process']): NativeCaptureController {
  const pending = new Map<
    NativeCaptureEvent['type'],
    Array<{
      resolve: (event: NativeCaptureEvent) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }>
  >();

  let eventListener: NativeCaptureEventListener | null = null;

  function dispatchToListener(event: NativeCaptureEvent): void {
    if (event.type === 'warning' || event.type === 'deviceChanged' || event.type === 'audioChunk') {
      eventListener?.(event);
    }
  }

  function resolvePending(event: NativeCaptureEvent): void {
    const listeners = pending.get(event.type);
    if (!listeners || listeners.length === 0) return;

    const listener = listeners.shift();
    if (!listener) return;

    clearTimeout(listener.timeout);
    listener.resolve(event);
  }

  const signal = (event: NativeCaptureEvent): void => {
    if (event.type === 'progress') return;
    dispatchToListener(event);
    resolvePending(event);
  };

  const rejectAll = (error: Error): void => {
    for (const listeners of pending.values()) {
      for (const listener of listeners) {
        clearTimeout(listener.timeout);
        listener.reject(error);
      }
    }
    pending.clear();
  };

  const stdoutBuffer = createJsonLineBuffer();
  processHandle.stdout.on('data', (chunk: Buffer) => {
    stdoutBuffer.append(chunk, (line) => {
      try {
        const event = JSON.parse(line) as NativeCaptureEvent;
        signal(event);
      } catch {
        rejectAll(new Error('Native audio capture emitted invalid JSON event'));
      }
    });
  });

  let stderrBuffer = '';
  processHandle.stderr.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString('utf8');
  });

  processHandle.once('exit', (code, exitSignal) => {
    const suffix = stderrBuffer.trim() ? `: ${stderrBuffer.trim()}` : '';
    rejectAll(
      new Error(
        `Native audio capture exited unexpectedly (code=${code}, signal=${exitSignal})${suffix}`,
      ),
    );
  });

  processHandle.once('error', (error) => {
    rejectAll(error);
  });

  return {
    send(command: NativeCaptureCommand): void {
      processHandle.stdin.write(`${JSON.stringify(command)}\n`);
    },

    waitFor(type, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Timed out waiting for native audio event: ${type}`));
        }, timeoutMs);

        const listeners = pending.get(type) ?? [];
        listeners.push({
          resolve: (event) => resolve(event as Extract<NativeCaptureEvent, { type: typeof type }>),
          reject,
          timeout,
        });
        pending.set(type, listeners);
      });
    },

    close(): void {
      eventListener = null;
      rejectAll(new Error('Native audio capture controller closed'));
    },

    onEvent(listener: NativeCaptureEventListener): void {
      eventListener = listener;
    },
  };
}

function spawnBinary() {
  const binaryPath = resolveNativeBinaryPath();
  return spawn(binaryPath, [], { stdio: 'pipe', windowsHide: true });
}

async function runOneShot<TSuccess extends NativeCaptureEvent['type']>(
  command: NativeCaptureCommand,
  successType: TSuccess,
  timeoutMs: number = ONE_SHOT_TIMEOUT_MS,
): Promise<Extract<NativeCaptureEvent, { type: TSuccess }>> {
  const processHandle = spawnBinary();
  const controller = createController(processHandle);

  try {
    controller.send(command);
    const result = (await Promise.race([
      controller.waitFor(successType, timeoutMs),
      controller.waitFor('error', timeoutMs),
    ])) as NativeCaptureEvent;

    if (result.type === 'error') {
      throw toCaptureError(result);
    }

    return result as Extract<NativeCaptureEvent, { type: TSuccess }>;
  } catch (error) {
    throw toSpawnError(error);
  } finally {
    controller.close();
    processHandle.kill('SIGTERM');
  }
}

function startCommand(input: StartCaptureInput): Extract<NativeCaptureCommand, { type: 'start' }> {
  return {
    type: 'start',
    format: input.format ?? 'opus',
    mode: 'dual',
    sampleRateHz: input.sampleRateHz ?? 16_000,
    channels: input.channels ?? 1,
    micDeviceId: input.micDeviceId ?? null,
    speakerDeviceId: input.speakerDeviceId ?? null,
    speakerGain: input.speakerGain ?? null,
    audioChunkConfig: input.audioChunkConfig ?? null,
  };
}

function toStopResult(event: NativeCaptureStoppedEvent): StopCaptureResult {
  return {
    endedAt: event.endedAt,
    durationMs: event.durationMs,
    warnings: event.warnings,
  };
}

function toDeviceList(event: NativeCaptureDeviceListEvent): AudioDeviceList {
  return {
    microphoneDevices: event.microphoneDevices,
    speakerDevices: event.speakerDevices,
  };
}

function toPermissionsStatus(event: NativeCapturePermissionsStatusEvent): AudioPermissionsStatus {
  return {
    microphone: event.microphone,
    screenCapture: event.screenCapture,
  };
}

function toCaptureError(event: NativeCaptureErrorEvent): Error {
  return new Error(`Native audio capture failed (${event.code}): ${event.message}`);
}

function toSpawnError(error: unknown): Error {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  ) {
    return new Error(
      'Native audio capture binary was not found. Build it with `bun run audio-native:build` or set STITCH_AUDIO_CAPTURE_BIN.',
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Failed to start native audio capture process');
}

export function createNativeDriver(platform: CapturePlatform): AudioCaptureDriver {
  return {
    platform,

    async start(input): Promise<ActiveCapture> {
      const processHandle = spawnBinary();
      const controller = createController(processHandle);
      let startedOrError:
        | Extract<NativeCaptureEvent, { type: 'started' }>
        | Extract<NativeCaptureEvent, { type: 'error' }>;

      try {
        controller.send(startCommand(input));
        startedOrError = await Promise.race([
          controller.waitFor('started', START_TIMEOUT_MS),
          controller.waitFor('error', START_TIMEOUT_MS),
        ]);
      } catch (error) {
        controller.close();
        processHandle.kill('SIGTERM');
        throw toSpawnError(error);
      }

      if (startedOrError.type === 'error') {
        controller.close();
        processHandle.kill('SIGTERM');
        throw toCaptureError(startedOrError);
      }

      const started = startedOrError;
      return {
        startedAt: started.startedAt,
        sessionId: `${started.startedAt}`,
        process: processHandle,
        controller,
      };
    },

    async stop(capture): Promise<StopCaptureResult> {
      capture.controller.send({ type: 'stop' });

      const stoppedOrError = await Promise.race([
        capture.controller.waitFor('stopped', STOP_TIMEOUT_MS),
        capture.controller.waitFor('error', STOP_TIMEOUT_MS),
      ]);

      capture.controller.close();
      capture.process.kill('SIGTERM');

      if (stoppedOrError.type === 'error') {
        throw toCaptureError(stoppedOrError);
      }

      return toStopResult(stoppedOrError);
    },

    async listDevices(): Promise<AudioDeviceList> {
      const event = await runOneShot({ type: 'listDevices' }, 'deviceList');
      return toDeviceList(event);
    },

    async checkPermissions(): Promise<AudioPermissionsStatus> {
      const event = await runOneShot({ type: 'checkPermissions' }, 'permissionsStatus');
      return toPermissionsStatus(event);
    },

    async primeSystemAudio(): Promise<AudioPermissionsStatus> {
      const event = await runOneShot(
        { type: 'primeSystemAudio' },
        'permissionsStatus',
        PRIME_SYSTEM_AUDIO_TIMEOUT_MS,
      );
      return toPermissionsStatus(event);
    },
  };
}
