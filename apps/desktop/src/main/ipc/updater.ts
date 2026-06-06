import { ipcMain, type BrowserWindow } from 'electron';

import type { UpdaterStatePayload } from '../ipc-types.js';
import type { createUpdater } from '../updater.js';

type Updater = ReturnType<typeof createUpdater>;

export function registerUpdaterHandlers(
  updater: Updater,
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle('updater:check', () => updater.checkForUpdates());
  ipcMain.handle('updater:getState', (): UpdaterStatePayload => updater.getState());
  ipcMain.handle('updater:install', () => updater.installUpdate());
  ipcMain.handle('updater:openManualUpdateAndQuit', () => updater.openManualUpdateAndQuit());

  updater.onEvent((state) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:event', state);
    }
  });
}
