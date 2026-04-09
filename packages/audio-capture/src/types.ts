import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export type CapturePlatform = 'darwin' | 'win32';

export type CaptureFormat = 'wav';

export type StartCaptureInput = {
  outputPath: string;
  format?: CaptureFormat;
};

export type ActiveCapture = {
  startedAt: number;
  outputPath: string;
  process: ChildProcessWithoutNullStreams;
};

export type StopCaptureResult = {
  endedAt: number;
  durationMs: number;
};

export type AudioCaptureDriver = {
  platform: CapturePlatform;
  start: (input: StartCaptureInput) => Promise<ActiveCapture>;
  stop: (capture: ActiveCapture) => Promise<StopCaptureResult>;
};
