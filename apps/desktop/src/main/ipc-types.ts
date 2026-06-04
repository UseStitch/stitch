import type {
  StartRecordingInput,
  StartRecordingResponse,
  StopRecordingResponse,
} from '@stitch/shared/recordings/types';

export type ServerConfigPayload = {
  url: string;
  mode: 'local' | 'remote';
  remoteUrl: string | null;
};

export type ServerTestRemoteResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export type UpdaterStatePayload = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'no-update' | 'error';
  version?: string;
  progress?: number;
  error?: string;
};

export type RecordingDevicesPayload = {
  microphoneDevices: string[];
  speakerDevices: string[];
};

export type RecordingPermissionsPayload = {
  microphone: 'granted' | 'denied' | 'unknown';
  screenCapture: 'granted' | 'denied' | 'unknown';
};

export type { StartRecordingInput, StartRecordingResponse, StopRecordingResponse };
