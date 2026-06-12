import type {
  RecordingDeviceChangedPayload,
  RecordingWarningPayload,
} from '../recordings/events.js';
import type {
  MeetingCallDetectedPayload,
  MeetingCallEndedPayload,
} from '../recordings/meeting-ipc.js';
import type {
  StartRecordingInput,
  StartRecordingResponse,
  StopRecordingResponse,
} from '../recordings/types.js';

export type {
  MeetingCallDetectedPayload,
  MeetingCallEndedPayload,
  RecordingDeviceChangedPayload,
  RecordingWarningPayload,
  StartRecordingInput,
  StartRecordingResponse,
  StopRecordingResponse,
};

export type ServerConfigPayload = {
  url: string;
  mode: 'local' | 'remote';
  remoteUrl: string | null;
};

export type ServerTestRemoteResult = { ok: true; url: string } | { ok: false; error: string };

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

export type MeetingCallDismissedPayload = {
  key: string;
};

export type MeetingDetectedNotificationPayload = MeetingCallDetectedPayload;

export type DesktopNotificationEvent = {
  id: string;
  type: 'meeting-detected';
  createdAt: number;
  autoDismissMs: number | null;
  payload: MeetingDetectedNotificationPayload;
};

export interface IpcContract {
  'get-server-config': { args: []; return: ServerConfigPayload };
  'server:test-remote': { args: [url: string]; return: ServerTestRemoteResult };
  'server:set-config': {
    args: [config: { mode: 'local' | 'remote'; remoteUrl: string | null }];
    return: ServerConfigPayload;
  };
  'window:minimize': { args: []; return: void };
  'window:maximize': { args: []; return: void };
  'window:close': { args: []; return: void };
  'window:isMaximized': { args: []; return: boolean };
  'window:isFullScreen': { args: []; return: boolean };
  'devtools:toggle': { args: []; return: void };
  'devtools:inspect': { args: [x: number, y: number]; return: void };
  'shell:openExternal': { args: [url: string]; return: void };
  'files:writeTmp': { args: [data: ArrayBuffer, ext: string]; return: string };
  'dialog:openPath': { args: []; return: string[] };
  'updater:check': { args: []; return: UpdaterStatePayload };
  'updater:getState': { args: []; return: UpdaterStatePayload };
  'updater:install': { args: []; return: boolean };
  'updater:openManualUpdateAndQuit': { args: []; return: boolean };
  'spellcheck:replaceMisspelling': { args: [word: string]; return: void };
  'spellcheck:addToDictionary': { args: [word: string]; return: void };
  'permissions:requestMicrophone': { args: []; return: boolean };
  'permissions:getScreenCaptureStatus': { args: []; return: string };
  'permissions:openScreenCaptureSettings': { args: []; return: void };
  'meeting:call-dismiss': { args: [key: string]; return: void };
  'recording:start': { args: [input: StartRecordingInput]; return: StartRecordingResponse };
  'recording:stop': { args: []; return: StopRecordingResponse };
  'recording:listDevices': { args: []; return: RecordingDevicesPayload };
  'recording:checkPermissions': { args: []; return: RecordingPermissionsPayload };
  'recording:primeSystemAudio': { args: []; return: RecordingPermissionsPayload };
  'notifications:dismiss': { args: [id: string]; return: void };
  'notifications:set-height': { args: [height: number]; return: void };
}

export interface IpcEventContract {
  'server:config-changed': [config: ServerConfigPayload];
  'meeting:call-detected': [payload: MeetingCallDetectedPayload];
  'meeting:call-ended': [payload: MeetingCallEndedPayload];
  'meeting:call-dismissed': [payload: MeetingCallDismissedPayload];
  'recording:warning': [payload: RecordingWarningPayload];
  'recording:device-changed': [payload: RecordingDeviceChangedPayload];
  'notifications:show': [event: DesktopNotificationEvent];
  'notifications:dismissed': [id: string];
}
