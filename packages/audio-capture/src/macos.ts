import { spawn } from 'node:child_process';
import { once } from 'node:events';

import type { ActiveCapture, AudioCaptureDriver, StartCaptureInput, StopCaptureResult } from './types.js';

function toFfmpegArgs(input: StartCaptureInput): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'avfoundation',
    '-i',
    ':0',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    input.outputPath,
  ];
}

async function waitForExit(process: ActiveCapture['process']): Promise<void> {
  await once(process, 'exit');
}

export const macosDriver: AudioCaptureDriver = {
  platform: 'darwin',

  async start(input): Promise<ActiveCapture> {
    const args = toFfmpegArgs(input);
    const process = spawn('ffmpeg', args, {
      stdio: 'pipe',
      windowsHide: true,
    });

    const startedAt = Date.now();

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        reject(error);
      };

      process.once('error', onError);

      setTimeout(() => {
        process.off('error', onError);
        resolve();
      }, 100);
    });

    return {
      startedAt,
      outputPath: input.outputPath,
      process,
    };
  },

  async stop(capture): Promise<StopCaptureResult> {
    if (!capture.process.killed) {
      capture.process.kill('SIGINT');
    }

    await Promise.race([
      waitForExit(capture.process),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          if (!capture.process.killed) {
            capture.process.kill('SIGKILL');
          }
          resolve();
        }, 5_000);
      }),
    ]);

    const endedAt = Date.now();
    return {
      endedAt,
      durationMs: endedAt - capture.startedAt,
    };
  },
};
