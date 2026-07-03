export type AudioChunkEncoding = 'f32le' | 'pcm_s16le';
export type AudioChunkSource = 'mic' | 'speaker';
export type PermissionState = 'granted' | 'denied' | 'unknown';

export type StartCaptureInput = {
  sampleRateHz: number;
  encoding: AudioChunkEncoding;
  micDeviceId?: string | null;
  speakerDeviceId?: string | null;
  echoCancellation?: boolean;
};

export type AudioChunkEvent = {
  type: 'audioChunk';
  source: AudioChunkSource;
  pcm: Buffer;
  sampleRateHz: number;
  numSamples: number;
  encoding: AudioChunkEncoding;
};

export type DeviceChangedEvent = {
  type: 'deviceChanged';
  kind: 'input' | 'output';
  deviceName: string | null;
};

export type WarningEvent = {
  type: 'warning';
  code: string;
  message: string;
};

export type CaptureEvent = AudioChunkEvent | DeviceChangedEvent | WarningEvent;
export type CaptureEventListener = (event: CaptureEvent) => void;

export type AudioDeviceList = {
  microphoneDevices: string[];
  speakerDevices: string[];
};

export type AudioPermissionsStatus = {
  microphone: PermissionState;
  screenCapture: PermissionState;
};

export type StopCaptureResult = {
  endedAt: number;
  durationMs: number;
  warnings: string[];
};

export type ActiveCapture = {
  startedAt: number;
};
