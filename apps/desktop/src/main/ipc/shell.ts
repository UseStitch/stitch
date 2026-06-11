import { shell } from 'electron';

import { registerIpcHandler } from './register.js';

export function registerShellHandlers(): void {
  registerIpcHandler('shell:openExternal', (_event, url) => {
    void shell.openExternal(url);
  });
}
