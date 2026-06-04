import { ipcMain, type BrowserWindow } from 'electron';

export function registerSpellcheckHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('spellcheck:replaceMisspelling', (_event, word: string) => {
    getWindow()?.webContents.replaceMisspelling(word);
  });

  ipcMain.handle('spellcheck:addToDictionary', (_event, word: string) => {
    getWindow()?.webContents.session.addWordToSpellCheckerDictionary(word);
  });
}
