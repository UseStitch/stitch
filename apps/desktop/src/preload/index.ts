import { contextBridge, ipcRenderer } from 'electron';

import type {
  IpcContract,
  IpcEventContract,
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
    onCallDetected: (callback: (payload: MeetingCallDetectedPayload) => void) =>
      onIpc('meeting:call-detected', callback),
    onCallEnded: (callback: (payload: MeetingCallEndedPayload) => void) =>
      onIpc('meeting:call-ended', callback),
  },
  recording: {
    start: (input: StartRecordingInput) => invokeIpc('recording:start', input),
    stop: () => invokeIpc('recording:stop'),
    listDevices: () => invokeIpc('recording:listDevices'),
    checkPermissions: () => invokeIpc('recording:checkPermissions'),
    onWarning: (callback: (payload: RecordingWarningPayload) => void) =>
      onIpc('recording:warning', callback),
    onDeviceChanged: (callback: (payload: RecordingDeviceChangedPayload) => void) =>
      onIpc('recording:device-changed', callback),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type DesktopApi = typeof api;
