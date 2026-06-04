import { ipcMain, shell, systemPreferences } from 'electron';

export function registerPermissionsHandlers(): void {
  ipcMain.handle('permissions:requestMicrophone', async () => {
    if (process.platform !== 'darwin') return true;
    return systemPreferences.askForMediaAccess('microphone');
  });

  ipcMain.handle('permissions:getScreenCaptureStatus', () => {
    if (process.platform !== 'darwin') return 'granted';
    return systemPreferences.getMediaAccessStatus('screen');
  });

  ipcMain.handle('permissions:openScreenCaptureSettings', () => {
    if (process.platform === 'darwin') {
      void shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
      );
    }
  });
}
