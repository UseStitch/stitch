import { registerIpcHandler } from './register.js';

import type { BrowserWindow } from 'electron';

export function registerClipboardHandlers(getWindow: () => BrowserWindow | null): void {
  registerIpcHandler('clipboard:cut', () => {
    getWindow()?.webContents.cut();
  });

  registerIpcHandler('clipboard:copy', () => {
    getWindow()?.webContents.copy();
  });

  registerIpcHandler('clipboard:paste', () => {
    getWindow()?.webContents.paste();
  });
}
