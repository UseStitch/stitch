import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export type CapturePlatform = 'darwin' | 'win32';

export type CaptureFormat = 'wav';

export type CaptureMode = 'mic' | 'speaker' | 'dual';

export type MeetingPlatform = 'zoom' | 'teams' | 'slack' | 'discord' | 'google-meet';

export type MeetingKind = 'desktop' | 'browser';

export type MeetingDetection = {
  key: string;
  platform: MeetingPlatform;
  kind: MeetingKind;
  displayName: string;
  processNames: string[];
  windowTitle: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
};

export type MeetingDetectedEvent = {
  type: 'detected';
  detection: MeetingDetection;
  detectedAt: number;
};

export type MeetingEndedEvent = {
  type: 'ended';
  key: string;
  endedAt: number;
};

export type MeetingDetectionEvent = MeetingDetectedEvent | MeetingEndedEvent;

export type MeetingDetectionListener = (event: MeetingDetectionEvent) => void;

export type MeetingDetectionOptions = {
  pollIntervalMs?: number;
  activationThresholdMs?: number;
  cooldownMs?: number;
  commandTimeoutMs?: number;
};

export type MeetingDetector = {
  start: () => void;
  stop: () => void;
  subscribe: (listener: MeetingDetectionListener) => () => void;
  getActive: () => MeetingDetection | null;
};

export type NativeCaptureStartCommand = {
  type: 'start';
  outputPath: string;
  format: CaptureFormat;
  mode: CaptureMode;
  sampleRateHz: number;
  channels: number;
  enableAec: boolean;
  micDeviceId: string | null;
  speakerDeviceId: string | null;
};

export type NativeCaptureStopCommand = {
  type: 'stop';
};

export type NativeCaptureStatusCommand = {
  type: 'status';
};

export type NativeCaptureCommand =
  | NativeCaptureStartCommand
  | NativeCaptureStopCommand
  | NativeCaptureStatusCommand;

export type NativeCaptureErrorCode =
  | 'permission_denied'
  | 'device_not_found'
  | 'stream_failed'
  | 'already_recording'
  | 'not_recording'
  | 'invalid_command'
  | 'internal_error';

export type NativeCaptureStartedEvent = {
  type: 'started';
  startedAt: number;
  outputPath: string;
};

export type NativeCaptureProgressEvent = {
  type: 'progress';
  durationMs: number;
};

export type NativeCaptureWarningEvent = {
  type: 'warning';
  code: string;
  message: string;
};

export type NativeCaptureErrorEvent = {
  type: 'error';
  code: NativeCaptureErrorCode;
  message: string;
};

export type NativeCaptureStoppedEvent = {
  type: 'stopped';
  endedAt: number;
  durationMs: number;
  outputPath: string;
  fileSizeBytes: number | null;
  sampleRateHz: number;
  channels: number;
  warnings: string[];
};

export type NativeCaptureStatusEvent = {
  type: 'status';
  state: 'inactive' | 'active' | 'finalizing';
};

export type NativeCaptureEvent =
  | NativeCaptureStartedEvent
  | NativeCaptureProgressEvent
  | NativeCaptureWarningEvent
  | NativeCaptureErrorEvent
  | NativeCaptureStoppedEvent
  | NativeCaptureStatusEvent;

export type NativeCaptureController = {
  send: (command: NativeCaptureCommand) => void;
  waitFor: <TType extends NativeCaptureEvent['type']>(
    type: TType,
    timeoutMs: number,
  ) => Promise<Extract<NativeCaptureEvent, { type: TType }>>;
  close: () => void;
};

export type StartCaptureInput = {
  outputPath: string;
  format?: CaptureFormat;
  mode?: CaptureMode;
  sampleRateHz?: number;
  channels?: number;
  enableAec?: boolean;
  micDeviceId?: string | null;
  speakerDeviceId?: string | null;
};

export type ActiveCapture = {
  startedAt: number;
  outputPath: string;
  sessionId: string;
  process: ChildProcessWithoutNullStreams;
  controller: NativeCaptureController;
};

export type StopCaptureResult = {
  endedAt: number;
  durationMs: number;
  fileSizeBytes: number | null;
  sampleRateHz: number;
  channels: number;
  warnings: string[];
};

export type AudioCaptureDriver = {
  platform: CapturePlatform;
  start: (input: StartCaptureInput) => Promise<ActiveCapture>;
  stop: (capture: ActiveCapture) => Promise<StopCaptureResult>;
};
