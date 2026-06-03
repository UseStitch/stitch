import type { ChildProcessWithoutNullStreams } from 'node:child_process';

type StitchLogger = {
  debug(extra: Record<string, unknown>, message: string): void;
  debug(message: string): void;
  info(extra: Record<string, unknown>, message: string): void;
  info(message: string): void;
  warn(extra: Record<string, unknown>, message: string): void;
  warn(message: string): void;
  error(extra: Record<string, unknown>, message: string): void;
  error(message: string): void;
};

export type CapturePlatform = 'darwin' | 'win32';

export type CaptureFormat = 'opus';

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
  activationThresholdMs?: number;
  cooldownMs?: number;
  logger?: StitchLogger;
};

export type MeetingDetector = {
  start: () => void;
  stop: () => void;
  subscribe: (listener: MeetingDetectionListener) => () => void;
  getActive: () => MeetingDetection | null;
};

export type AudioChunkEncoding = 'f32le' | 'pcm_s16le';

export type AudioChunkConfig = {
  encoding: AudioChunkEncoding;
  sampleRateHz: number;
};

export type NativeCaptureStartCommand = {
  type: 'start';
  outputPath: string;
  format: CaptureFormat;
  mode: CaptureMode;
  sampleRateHz: number;
  channels: number;
  micDeviceId: string | null;
  speakerDeviceId: string | null;
  speakerGain: number | null;
  audioChunkConfig: AudioChunkConfig | null;
};

export type NativeCaptureStopCommand = {
  type: 'stop';
};

export type NativeCaptureStatusCommand = {
  type: 'status';
};

export type NativeCaptureListDevicesCommand = {
  type: 'listDevices';
};

export type NativeCaptureCapabilitiesCommand = {
  type: 'capabilities';
};

export type NativeCaptureCheckPermissionsCommand = {
  type: 'checkPermissions';
};

export type NativeCaptureCommand =
  | NativeCaptureStartCommand
  | NativeCaptureStopCommand
  | NativeCaptureStatusCommand
  | NativeCaptureListDevicesCommand
  | NativeCaptureCapabilitiesCommand
  | NativeCaptureCheckPermissionsCommand;

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

export type NativeCaptureDeviceListEvent = {
  type: 'deviceList';
  microphoneDevices: string[];
  speakerDevices: string[];
};

export type NativeCaptureCapabilitiesEvent = {
  type: 'capabilities';
  supportedModes: CaptureMode[];
  supportsRealtimeDual: boolean;
};

export type PermissionState = 'granted' | 'denied' | 'unknown';

export type NativeCapturePermissionsStatusEvent = {
  type: 'permissionsStatus';
  microphone: PermissionState;
  screenCapture: PermissionState;
};

export type AudioPermissionsStatus = {
  microphone: PermissionState;
  screenCapture: PermissionState;
};

export type NativeCaptureDeviceChangedEvent = {
  type: 'deviceChanged';
  kind: 'input' | 'output' | 'list';
  deviceName: string | null;
};

export type AudioChunkSource = 'mic' | 'speaker';

export type NativeCaptureAudioChunkEvent = {
  type: 'audioChunk';
  source: AudioChunkSource;
  samplesB64: string;
  sampleRateHz: number;
  numSamples: number;
};

export type NativeCaptureEvent =
  | NativeCaptureStartedEvent
  | NativeCaptureProgressEvent
  | NativeCaptureWarningEvent
  | NativeCaptureErrorEvent
  | NativeCaptureStoppedEvent
  | NativeCaptureStatusEvent
  | NativeCaptureDeviceListEvent
  | NativeCaptureCapabilitiesEvent
  | NativeCapturePermissionsStatusEvent
  | NativeCaptureDeviceChangedEvent
  | NativeCaptureAudioChunkEvent;

export type NativeCaptureEventListener = (
  event: NativeCaptureWarningEvent | NativeCaptureDeviceChangedEvent | NativeCaptureAudioChunkEvent,
) => void;

export type NativeCaptureController = {
  send: (command: NativeCaptureCommand) => void;
  waitFor: <TType extends NativeCaptureEvent['type']>(
    type: TType,
    timeoutMs: number,
  ) => Promise<Extract<NativeCaptureEvent, { type: TType }>>;
  onEvent: (listener: NativeCaptureEventListener) => void;
  close: () => void;
};

export type StartCaptureInput = {
  outputPath: string;
  format?: CaptureFormat;
  sampleRateHz?: number;
  channels?: number;
  micDeviceId?: string | null;
  speakerDeviceId?: string | null;
  speakerGain?: number | null;
  audioChunkConfig?: AudioChunkConfig | null;
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
  listDevices: () => Promise<AudioDeviceList>;
  checkPermissions: () => Promise<AudioPermissionsStatus>;
};

export type AudioDeviceList = {
  microphoneDevices: string[];
  speakerDevices: string[];
};
