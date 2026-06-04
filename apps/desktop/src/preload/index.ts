import { contextBridge, ipcRenderer } from 'electron';

import type {
  MeetingCallDetectedPayload,
  MeetingCallEndedPayload,
} from '@stitch/shared/chat/realtime';

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
  getServerConfig: () => ipcRenderer.invoke('get-server-config') as Promise<{ url: string }>,
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
    check: () =>
      ipcRenderer.invoke('updater:check') as Promise<{
        status: string;
        version?: string;
        progress?: number;
        error?: string;
      }>,
    getState: () =>
      ipcRenderer.invoke('updater:getState') as Promise<{
        status: string;
        version?: string;
        progress?: number;
        error?: string;
      }>,
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
});
