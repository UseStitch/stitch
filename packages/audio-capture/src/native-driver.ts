import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  ActiveCapture,
  AudioCaptureDriver,
  CapturePlatform,
  NativeCaptureCommand,
  NativeCaptureController,
  NativeCaptureErrorEvent,
  NativeCaptureEvent,
  NativeCaptureStoppedEvent,
  StartCaptureInput,
  StopCaptureResult,
} from './types.js';

const START_TIMEOUT_MS = 10_000;
const STOP_TIMEOUT_MS = 10_000;

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

  return [
    path.join(resourcesPath, binaryName),
    path.join(resourcesPath, 'audio-capture', binaryName),
  ];
}

function resolveNativeBinaryPath(): string {
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

function createController(processHandle: ActiveCapture['process']): NativeCaptureController {
  const pending = new Map<
    NativeCaptureEvent['type'],
    Array<{
      resolve: (event: NativeCaptureEvent) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }>
  >();

  const signal = (event: NativeCaptureEvent): void => {
    if (event.type === 'progress') {
      return;
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
      new Error(`Native audio capture exited unexpectedly (code=${code}, signal=${exitSignal})${suffix}`),
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
      rejectAll(new Error('Native audio capture controller closed'));
    },
  };
}

function startCommand(input: StartCaptureInput): Extract<NativeCaptureCommand, { type: 'start' }> {
  return {
    type: 'start',
    outputPath: input.outputPath,
    format: input.format ?? 'wav',
    mode: input.mode ?? 'dual',
    sampleRateHz: input.sampleRateHz ?? 16_000,
    channels: input.channels ?? 1,
    enableAec: input.enableAec ?? true,
    micDeviceId: input.micDeviceId ?? null,
    speakerDeviceId: input.speakerDeviceId ?? null,
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
  };
}
