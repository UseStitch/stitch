import { contextBridge, ipcRenderer } from 'electron';

import type { ElectronBrowserState } from '@stitch/shared/browser/electron';
import type {
  IpcContract,
  IpcEventContract,
  DesktopNotificationEvent,
  BrowserNavigateResult,
  MeetingCallDismissedPayload,
  MeetingCallDetectedPayload,
  MeetingCallEndedPayload,
  RecordingDeviceChangedPayload,
  RecordingWarningPayload,
  ServerConfigPayload,
  StartRecordingInput,
} from '@stitch/shared/ipc/types';

function invokeIpc<TKey extends keyof IpcContract>(
  channel: TKey,
  ...args: IpcContract[TKey]['args']
): Promise<IpcContract[TKey]['return']> {
  return ipcRenderer.invoke(channel, ...args);
}

function onIpc<TKey extends keyof IpcEventContract>(
  channel: TKey,
  callback: (...payload: IpcEventContract[TKey]) => void,
): () => void {
  const subscription = (_event: Electron.IpcRendererEvent, ...payload: IpcEventContract[TKey]) =>
    callback(...payload);
  ipcRenderer.on(channel, subscription);
  return () => ipcRenderer.removeListener(channel, subscription);
}

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  send: (channel: string, data?: unknown) => ipcRenderer.send(channel, data),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
});

const api = {
  getServerConfig: () => invokeIpc('get-server-config'),
  server: {
    testRemote: (url: string) => invokeIpc('server:test-remote', url),
    setConfig: (config: { mode: 'local' | 'remote'; remoteUrl: string | null }) =>
      invokeIpc('server:set-config', config),
    onConfigChanged: (callback: (config: ServerConfigPayload) => void) =>
      onIpc('server:config-changed', callback),
  },
  window: {
    minimize: () => invokeIpc('window:minimize'),
    maximize: () => invokeIpc('window:maximize'),
    close: () => invokeIpc('window:close'),
    isMaximized: () => invokeIpc('window:isMaximized'),
    isFullScreen: () => invokeIpc('window:isFullScreen'),
  },
  devtools: {
    toggle: () => invokeIpc('devtools:toggle'),
    inspect: (x: number, y: number) => invokeIpc('devtools:inspect', x, y),
  },
  shell: {
    openExternal: (url: string) => invokeIpc('shell:openExternal', url),
  },
  files: {
    writeTmp: (data: ArrayBuffer, ext: string) => invokeIpc('files:writeTmp', data, ext),
    openPath: () => invokeIpc('dialog:openPath'),
  },
  updater: {
    check: () => invokeIpc('updater:check'),
    getState: () => invokeIpc('updater:getState'),
    install: () => invokeIpc('updater:install'),
    openManualUpdateAndQuit: () => invokeIpc('updater:openManualUpdateAndQuit'),
  },
  spellcheck: {
    replaceMisspelling: (word: string) => invokeIpc('spellcheck:replaceMisspelling', word),
    addToDictionary: (word: string) => invokeIpc('spellcheck:addToDictionary', word),
  },
  permissions: {
    requestMicrophone: () => invokeIpc('permissions:requestMicrophone'),
    getScreenCaptureStatus: () => invokeIpc('permissions:getScreenCaptureStatus'),
    openScreenCaptureSettings: () => invokeIpc('permissions:openScreenCaptureSettings'),
  },
  meeting: {
    dismissCall: (key: string) => invokeIpc('meeting:call-dismiss', key),
    onCallDetected: (callback: (payload: MeetingCallDetectedPayload) => void) =>
      onIpc('meeting:call-detected', callback),
    onCallEnded: (callback: (payload: MeetingCallEndedPayload) => void) =>
      onIpc('meeting:call-ended', callback),
    onCallDismissed: (callback: (payload: MeetingCallDismissedPayload) => void) =>
      onIpc('meeting:call-dismissed', callback),
  },
  recording: {
    start: (input: StartRecordingInput) => invokeIpc('recording:start', input),
    stop: () => invokeIpc('recording:stop'),
    listDevices: () => invokeIpc('recording:listDevices'),
    checkPermissions: () => invokeIpc('recording:checkPermissions'),
    primeSystemAudio: () => invokeIpc('recording:primeSystemAudio'),
    onWarning: (callback: (payload: RecordingWarningPayload) => void) =>
      onIpc('recording:warning', callback),
    onDeviceChanged: (callback: (payload: RecordingDeviceChangedPayload) => void) =>
      onIpc('recording:device-changed', callback),
  },
  notifications: {
    dismiss: (id: string) => invokeIpc('notifications:dismiss', id),
    setHeight: (height: number) => invokeIpc('notifications:set-height', height),
    onShow: (callback: (event: DesktopNotificationEvent) => void) =>
      onIpc('notifications:show', callback),
    onDismissed: (callback: (id: string) => void) => onIpc('notifications:dismissed', callback),
  },
  browser: {
    getState: () => invokeIpc('browser:getState'),
    registerWebview: (webContentsId: number, sessionId: string) =>
      invokeIpc('browser:registerWebview', webContentsId, sessionId),
    switchSession: (sessionId: string) => invokeIpc('browser:switchSession', sessionId),
    show: () => invokeIpc('browser:show'),
    hide: () => invokeIpc('browser:hide'),
    userNavigate: (url: string): Promise<BrowserNavigateResult> =>
      invokeIpc('browser:userNavigate', url),
    goBack: () => invokeIpc('browser:goBack'),
    goForward: () => invokeIpc('browser:goForward'),
    reload: () => invokeIpc('browser:reload'),
    newTab: (url?: string) => invokeIpc('browser:newTab', url),
    focusTab: (tabId: string) => invokeIpc('browser:focusTab', tabId),
    closeTab: (tabId: string) => invokeIpc('browser:closeTab', tabId),
    recordHumanInput: () => invokeIpc('browser:recordHumanInput'),
    onStateChanged: (callback: (state: ElectronBrowserState) => void) =>
      onIpc('browser:state-changed', callback),
    onShowRequested: (callback: () => void) => onIpc('browser:show-requested', callback),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type DesktopApi = typeof api;
