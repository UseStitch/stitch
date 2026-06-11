import { registerIpcHandler } from './register.js';

import type { BrowserWindow } from 'electron';

export function registerWindowHandlers(getWindow: () => BrowserWindow | null): void {
  registerIpcHandler('window:minimize', () => {
    getWindow()?.minimize();
  });

  registerIpcHandler('window:maximize', () => {
    const win = getWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  registerIpcHandler('window:close', () => {
    getWindow()?.hide();
  });

  registerIpcHandler('window:isMaximized', () => {
    return getWindow()?.isMaximized() ?? false;
  });

  registerIpcHandler('window:isFullScreen', () => {
    return getWindow()?.isFullScreen() ?? false;
  });
}
