import { ipcMain, type BrowserWindow } from 'electron';

export function registerWindowHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('window:minimize', () => {
    getWindow()?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    const win = getWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    getWindow()?.hide();
  });

  ipcMain.handle('window:isMaximized', () => {
    return getWindow()?.isMaximized() ?? false;
  });

  ipcMain.handle('window:isFullScreen', () => {
    return getWindow()?.isFullScreen() ?? false;
  });
}
