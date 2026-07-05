import type { StartRecordingResponse, StopRecordingResponse } from '@stitch/shared/ipc/types';

import {
  checkRecordingPermissions,
  listRecordingDevices,
  primeRecordingSystemAudio,
  startRecordingCapture,
  stopRecordingCapture,
} from '../recording-capture.js';
import { serverJson } from '../server-client.js';
import { registerIpcHandler } from './register.js';

import type { BrowserWindow } from 'electron';

export function registerRecordingHandlers(getServerUrl: () => string, getWindow: () => BrowserWindow | null): void {
  registerIpcHandler('recording:start', async (_event, input) => {
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

  registerIpcHandler('recording:stop', async () => {
    const serverUrl = getServerUrl();
    const stopInput = await stopRecordingCapture();
    return serverJson<StopRecordingResponse>(serverUrl, '/recordings/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stopInput),
    });
  });

  registerIpcHandler('recording:listDevices', () => listRecordingDevices());
  registerIpcHandler('recording:checkPermissions', () => checkRecordingPermissions());
  registerIpcHandler('recording:primeSystemAudio', () => primeRecordingSystemAudio());
}
