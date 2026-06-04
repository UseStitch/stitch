import { contextBridge, ipcRenderer } from 'electron';

import type {
  MeetingCallDetectedPayload,
  MeetingCallEndedPayload,
  RecordingDeviceChangedPayload,
  RecordingWarningPayload,
} from '@stitch/shared/chat/realtime';

import type {
  RecordingDevicesPayload,
  RecordingPermissionsPayload,
  ServerConfigPayload,
  ServerTestRemoteResult,
  StartRecordingInput,
  StartRecordingResponse,
  StopRecordingResponse,
  UpdaterStatePayload,
} from '../main/ipc-types.js';

function onIpc<TPayload>(channel: string, callback: (payload: TPayload) => void): () => void {
  const subscription = (_event: Electron.IpcRendererEvent, payload: TPayload) => callback(payload);
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

contextBridge.exposeInMainWorld('api', {
  getServerConfig: () => ipcRenderer.invoke('get-server-config') as Promise<ServerConfigPayload>,
  server: {
    testRemote: (url: string) =>
      ipcRenderer.invoke('server:test-remote', url) as Promise<ServerTestRemoteResult>,
    setConfig: (config: { mode: 'local' | 'remote'; remoteUrl: string | null }) =>
      ipcRenderer.invoke('server:set-config', config) as Promise<ServerConfigPayload>,
    onConfigChanged: (callback: (config: ServerConfigPayload) => void) =>
      onIpc('server:config-changed', callback),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
    isFullScreen: () => ipcRenderer.invoke('window:isFullScreen') as Promise<boolean>,
  },
  devtools: {
    toggle: () => ipcRenderer.invoke('devtools:toggle'),
    inspect: (x: number, y: number) => ipcRenderer.invoke('devtools:inspect', x, y),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
  files: {
    writeTmp: (data: ArrayBuffer, ext: string) =>
      ipcRenderer.invoke('files:writeTmp', data, ext) as Promise<string>,
    openPath: () => ipcRenderer.invoke('dialog:openPath') as Promise<string[]>,
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check') as Promise<UpdaterStatePayload>,
    getState: () => ipcRenderer.invoke('updater:getState') as Promise<UpdaterStatePayload>,
    install: () => ipcRenderer.invoke('updater:install') as Promise<boolean>,
  },
  spellcheck: {
    replaceMisspelling: (word: string) => ipcRenderer.invoke('spellcheck:replaceMisspelling', word),
    addToDictionary: (word: string) => ipcRenderer.invoke('spellcheck:addToDictionary', word),
  },
  permissions: {
    requestMicrophone: () =>
      ipcRenderer.invoke('permissions:requestMicrophone') as Promise<boolean>,
    getScreenCaptureStatus: () =>
      ipcRenderer.invoke('permissions:getScreenCaptureStatus') as Promise<string>,
    openScreenCaptureSettings: () =>
      ipcRenderer.invoke('permissions:openScreenCaptureSettings') as Promise<void>,
  },
  meeting: {
    onCallDetected: (callback: (payload: MeetingCallDetectedPayload) => void) =>
      onIpc('meeting:call-detected', callback),
    onCallEnded: (callback: (payload: MeetingCallEndedPayload) => void) =>
      onIpc('meeting:call-ended', callback),
  },
  recording: {
    start: (input: StartRecordingInput) =>
      ipcRenderer.invoke('recording:start', input) as Promise<StartRecordingResponse>,
    stop: () => ipcRenderer.invoke('recording:stop') as Promise<StopRecordingResponse>,
    listDevices: () =>
      ipcRenderer.invoke('recording:listDevices') as Promise<RecordingDevicesPayload>,
    checkPermissions: () =>
      ipcRenderer.invoke('recording:checkPermissions') as Promise<RecordingPermissionsPayload>,
    onWarning: (callback: (payload: RecordingWarningPayload) => void) =>
      onIpc('recording:warning', callback),
    onDeviceChanged: (callback: (payload: RecordingDeviceChangedPayload) => void) =>
      onIpc('recording:device-changed', callback),
  },
});
