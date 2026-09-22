import { z } from 'zod';

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

const recordingSchema = z.object({
  id: z.string().regex(/^rec_/),
  title: z.string(),
  analysisTitle: z.string().nullable(),
  source: z.string(),
  status: z.enum(['recording', 'completed', 'failed']),
  platform: z.enum(['zoom', 'teams', 'slack', 'discord', 'google-meet', 'manual']),
  durationMs: z.number().nullable(),
  costUsd: z.number().nullable(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  error: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
const startRecordingResponseSchema = z.custom<StartRecordingResponse>(
  (value) =>
    z
      .object({
        recording: recordingSchema,
        recordingId: z.string().regex(/^rec_/),
        micDeviceId: z.string().nullable(),
        speakerDeviceId: z.string().nullable(),
        audioChunkConfig: z.object({ encoding: z.enum(['f32le', 'pcm_s16le']), sampleRateHz: z.number() }),
        stt: z.object({ providerId: z.string(), modelId: z.string() }),
      })
      .safeParse(value).success,
);
const stopRecordingResponseSchema = z.custom<StopRecordingResponse>(
  (value) => z.object({ recording: recordingSchema }).safeParse(value).success,
);
const emptyResponseSchema = z.unknown();

export function registerRecordingHandlers(getServerUrl: () => string, getWindow: () => BrowserWindow | null): void {
  registerIpcHandler('recording:start', async (_event, input) => {
    const serverUrl = getServerUrl();
    const startResponse = await serverJson(serverUrl, '/recordings/start', startRecordingResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    try {
      await startRecordingCapture({ ...startResponse, serverUrl }, () => getWindow());
    } catch (error) {
      await serverJson(serverUrl, '/recordings/stop', emptyResponseSchema, {
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
    return serverJson(serverUrl, '/recordings/stop', stopRecordingResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stopInput),
    });
  });

  registerIpcHandler('recording:listDevices', () => listRecordingDevices());
  registerIpcHandler('recording:checkPermissions', () => checkRecordingPermissions());
  registerIpcHandler('recording:primeSystemAudio', () => primeRecordingSystemAudio());
}
