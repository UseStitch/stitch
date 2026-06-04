import { ipcMain, shell } from 'electron';

export function registerShellHandlers(): void {
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    void shell.openExternal(url);
  });
}
