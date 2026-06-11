import { ipcMain, type BrowserWindow } from 'electron';

import {
  checkRecordingPermissions,
  listRecordingDevices,
  primeRecordingSystemAudio,
  startRecordingCapture,
  stopRecordingCapture,
} from '../recording-capture.js';
import { serverJson } from '../server-client.js';

import type {
  StartRecordingInput,
  StartRecordingResponse,
  StopRecordingResponse,
} from '../ipc-types.js';

export function registerRecordingHandlers(
  getServerUrl: () => string,
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle('recording:start', async (_event, input: StartRecordingInput) => {
    const serverUrl = getServerUrl();
    const startResponse = await serverJson<StartRecordingResponse>(serverUrl, '/recordings/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    try {
      await startRecordingCapture({ ...startResponse, serverUrl }, () => getWindow());
    } catch (error) {
      await serverJson(serverUrl, '/recordings/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMs: null, fileSizeBytes: null }),
      }).catch(() => null);
      throw error;
    }

    return startResponse;
  });

  ipcMain.handle('recording:stop', async () => {
    const serverUrl = getServerUrl();
    const stopInput = await stopRecordingCapture();
    return serverJson<StopRecordingResponse>(serverUrl, '/recordings/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stopInput),
    });
  });

  ipcMain.handle('recording:listDevices', () => listRecordingDevices());
  ipcMain.handle('recording:checkPermissions', () => checkRecordingPermissions());
  ipcMain.handle('recording:primeSystemAudio', () => primeRecordingSystemAudio());
}
