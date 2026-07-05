import { shell, systemPreferences } from 'electron';

import { registerIpcHandler } from './register.js';

export function registerPermissionsHandlers(): void {
  registerIpcHandler('permissions:requestMicrophone', async () => {
    if (process.platform !== 'darwin') return true;
    return systemPreferences.askForMediaAccess('microphone');
  });

  registerIpcHandler('permissions:getScreenCaptureStatus', () => {
    if (process.platform !== 'darwin') return 'granted';
    return systemPreferences.getMediaAccessStatus('screen');
  });

  registerIpcHandler('permissions:openScreenCaptureSettings', () => {
    if (process.platform === 'darwin') {
      void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    }
  });
}
