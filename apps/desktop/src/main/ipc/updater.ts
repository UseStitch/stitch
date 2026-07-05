import type { UpdaterStatePayload } from '@stitch/shared/ipc/types';

import { registerIpcHandler } from './register.js';

import type { createUpdater } from '../updater.js';
import type { BrowserWindow } from 'electron';

type Updater = ReturnType<typeof createUpdater>;

export function registerUpdaterHandlers(updater: Updater, getWindow: () => BrowserWindow | null): void {
  registerIpcHandler('updater:check', () => updater.checkForUpdates());
  registerIpcHandler('updater:getState', (): UpdaterStatePayload => updater.getState());
  registerIpcHandler('updater:install', () => updater.installUpdate());
  registerIpcHandler('updater:openManualUpdateAndQuit', () => updater.openManualUpdateAndQuit());

  updater.onEvent((state) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:event', state);
    }
  });
}
