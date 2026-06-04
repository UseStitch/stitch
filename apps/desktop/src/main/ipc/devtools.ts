import { ipcMain, type BrowserWindow } from 'electron';

export function registerDevtoolsHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('devtools:toggle', () => {
    getWindow()?.webContents.toggleDevTools();
  });

  ipcMain.handle('devtools:inspect', (_event, x: number, y: number) => {
    getWindow()?.webContents.inspectElement(x, y);
  });
}
