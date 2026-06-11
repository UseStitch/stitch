import { registerIpcHandler } from './register.js';

import type { BrowserWindow } from 'electron';

export function registerSpellcheckHandlers(getWindow: () => BrowserWindow | null): void {
  registerIpcHandler('spellcheck:replaceMisspelling', (_event, word) => {
    getWindow()?.webContents.replaceMisspelling(word);
  });

  registerIpcHandler('spellcheck:addToDictionary', (_event, word) => {
    getWindow()?.webContents.session.addWordToSpellCheckerDictionary(word);
  });
}
