import { contextBridge, ipcRenderer } from 'electron';

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
});
