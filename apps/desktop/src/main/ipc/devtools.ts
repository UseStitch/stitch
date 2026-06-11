import { registerIpcHandler } from './register.js';

import type { BrowserWindow } from 'electron';

export function registerDevtoolsHandlers(getWindow: () => BrowserWindow | null): void {
  registerIpcHandler('devtools:toggle', () => {
    getWindow()?.webContents.toggleDevTools();
  });

  registerIpcHandler('devtools:inspect', (_event, x, y) => {
    getWindow()?.webContents.inspectElement(x, y);
  });
}
