import { spawn } from 'node:child_process';

import { resolveNativeBinaryPath } from './native-binary.js';

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
const LIST_DEVICES_TIMEOUT_MS = 5_000;
const CHECK_PERMISSIONS_TIMEOUT_MS = 5_000;

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

  const signal = (event: NativeCaptureEvent): void => {
    if (event.type === 'progress') {
      return;
    }

    if (event.type === 'warning' || event.type === 'deviceChanged' || event.type === 'audioChunk') {
      eventListener?.(event);
    }

    const listeners = pending.get(event.type);
    if (!listeners || listeners.length === 0) {
      return;
    }

    const listener = listeners.shift();
    if (!listener) {
      return;
    }

    clearTimeout(listener.timeout);
    listener.resolve(event);
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

  let stdoutBuffer = '';
  processHandle.stdout.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString('utf8');
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const event = JSON.parse(trimmed) as NativeCaptureEvent;
        signal(event);
      } catch {
        rejectAll(new Error('Native audio capture emitted invalid JSON event'));
      }
    }
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

function startCommand(input: StartCaptureInput): Extract<NativeCaptureCommand, { type: 'start' }> {
  return {
    type: 'start',
    outputPath: input.outputPath,
    format: input.format ?? 'opus',
    mode: 'dual',
    sampleRateHz: 16_000,
    channels: input.channels ?? 1,
    micDeviceId: input.micDeviceId ?? null,
    speakerDeviceId: input.speakerDeviceId ?? null,
    speakerGain: input.speakerGain ?? null,
  };
}

function toStopResult(event: NativeCaptureStoppedEvent): StopCaptureResult {
  return {
    endedAt: event.endedAt,
    durationMs: event.durationMs,
    fileSizeBytes: event.fileSizeBytes,
    sampleRateHz: event.sampleRateHz,
    channels: event.channels,
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

function toStartError(event: NativeCaptureErrorEvent): Error {
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
      const binaryPath = resolveNativeBinaryPath();
      const processHandle = spawn(binaryPath, [], {
        stdio: 'pipe',
        windowsHide: true,
      });

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
        throw toStartError(startedOrError);
      }

      const started = startedOrError;
      return {
        startedAt: started.startedAt,
        outputPath: started.outputPath,
        sessionId: `${started.startedAt}:${started.outputPath}`,
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
        throw toStartError(stoppedOrError);
      }

      return toStopResult(stoppedOrError);
    },

    async listDevices(): Promise<AudioDeviceList> {
      const binaryPath = resolveNativeBinaryPath();
      const processHandle = spawn(binaryPath, [], {
        stdio: 'pipe',
        windowsHide: true,
      });

      const controller = createController(processHandle);

      try {
        controller.send({ type: 'listDevices' });
        const deviceListOrError = await Promise.race([
          controller.waitFor('deviceList', LIST_DEVICES_TIMEOUT_MS),
          controller.waitFor('error', LIST_DEVICES_TIMEOUT_MS),
        ]);

        if (deviceListOrError.type === 'error') {
          throw toStartError(deviceListOrError);
        }

        return toDeviceList(deviceListOrError);
      } catch (error) {
        throw toSpawnError(error);
      } finally {
        controller.close();
        processHandle.kill('SIGTERM');
      }
    },

    async checkPermissions(): Promise<AudioPermissionsStatus> {
      const binaryPath = resolveNativeBinaryPath();
      const processHandle = spawn(binaryPath, [], {
        stdio: 'pipe',
        windowsHide: true,
      });

      const controller = createController(processHandle);

      try {
        controller.send({ type: 'checkPermissions' });
        const permissionsOrError = await Promise.race([
          controller.waitFor('permissionsStatus', CHECK_PERMISSIONS_TIMEOUT_MS),
          controller.waitFor('error', CHECK_PERMISSIONS_TIMEOUT_MS),
        ]);

        if (permissionsOrError.type === 'error') {
          throw toStartError(permissionsOrError);
        }

        return toPermissionsStatus(permissionsOrError);
      } catch (error) {
        throw toSpawnError(error);
      } finally {
        controller.close();
        processHandle.kill('SIGTERM');
      }
    },
  };
}
