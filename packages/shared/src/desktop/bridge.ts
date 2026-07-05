import type { ElectronBrowserState } from '../browser/electron.js';
import type {
  BrowserNavigateResult,
  DesktopNotificationEvent,
  MeetingCallDetectedPayload,
  MeetingCallDismissedPayload,
  MeetingCallEndedPayload,
  RecordingDeviceChangedPayload,
  RecordingDevicesPayload,
  RecordingPermissionsPayload,
  RecordingWarningPayload,
  ServerConfigPayload,
  ServerTestRemoteResult,
  StartRecordingInput,
  StartRecordingResponse,
  StopRecordingResponse,
  UpdaterStatePayload,
} from '../ipc/types.js';

export type DesktopPlatform = NodeJS.Platform;

export type DesktopBridge = {
  getServerConfig: () => Promise<ServerConfigPayload>;
  server: {
    testRemote: (url: string) => Promise<ServerTestRemoteResult>;
    setConfig: (config: { mode: 'local' | 'remote'; remoteUrl: string | null }) => Promise<ServerConfigPayload>;
    onConfigChanged: (callback: (config: ServerConfigPayload) => void) => () => void;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    isFullScreen: () => Promise<boolean>;
  };
  devtools: {
    toggle: () => Promise<void>;
    inspect: (x: number, y: number) => Promise<void>;
  };
  shell: { openExternal: (url: string) => Promise<void> };
  files: {
    writeTmp: (data: ArrayBuffer, ext: string) => Promise<string>;
    openPath: () => Promise<string[]>;
  };
  updater: {
    check: () => Promise<UpdaterStatePayload>;
    getState: () => Promise<UpdaterStatePayload>;
    install: () => Promise<boolean>;
    openManualUpdateAndQuit: () => Promise<boolean>;
  };
  spellcheck: {
    replaceMisspelling: (word: string) => Promise<void>;
    addToDictionary: (word: string) => Promise<void>;
  };
  permissions: {
    requestMicrophone: () => Promise<boolean>;
    getScreenCaptureStatus: () => Promise<string>;
    openScreenCaptureSettings: () => Promise<void>;
  };
  meeting: {
    dismissCall: (key: string) => Promise<void>;
    onCallDetected: (callback: (payload: MeetingCallDetectedPayload) => void) => () => void;
    onCallEnded: (callback: (payload: MeetingCallEndedPayload) => void) => () => void;
    onCallDismissed: (callback: (payload: MeetingCallDismissedPayload) => void) => () => void;
  };
  recording: {
    start: (input: StartRecordingInput) => Promise<StartRecordingResponse>;
    stop: () => Promise<StopRecordingResponse>;
    listDevices: () => Promise<RecordingDevicesPayload>;
    checkPermissions: () => Promise<RecordingPermissionsPayload>;
    primeSystemAudio: () => Promise<RecordingPermissionsPayload>;
    onWarning: (callback: (payload: RecordingWarningPayload) => void) => () => void;
    onDeviceChanged: (callback: (payload: RecordingDeviceChangedPayload) => void) => () => void;
  };
  notifications: {
    dismiss: (id: string) => Promise<void>;
    setHeight: (height: number) => Promise<void>;
    onShow: (callback: (event: DesktopNotificationEvent) => void) => () => void;
    onDismissed: (callback: (id: string) => void) => () => void;
  };
  browser: {
    getState: () => Promise<ElectronBrowserState>;
    registerWebview: (webContentsId: number, sessionId: string) => Promise<ElectronBrowserState>;
    switchSession: (sessionId: string) => Promise<ElectronBrowserState>;
    show: () => Promise<ElectronBrowserState>;
    hide: () => Promise<ElectronBrowserState>;
    userNavigate: (url: string) => Promise<BrowserNavigateResult>;
    goBack: () => Promise<void>;
    goForward: () => Promise<void>;
    reload: () => Promise<void>;
    newTab: (url?: string) => Promise<ElectronBrowserState>;
    focusTab: (tabId: string) => Promise<ElectronBrowserState>;
    closeTab: (tabId: string) => Promise<ElectronBrowserState>;
    recordHumanInput: () => Promise<void>;
    onStateChanged: (callback: (state: ElectronBrowserState) => void) => () => void;
    onShowRequested: (callback: () => void) => () => void;
  };
};

export type ElectronBridge = {
  platform: DesktopPlatform;
  send: (channel: string, data?: unknown) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
};
