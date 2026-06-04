import type { BrowserWindow } from 'electron';

import { createAudioCaptureHandle, resolveNativeBinaryPath } from '@stitch/audio-capture';

import type {
  RecordingDeviceChangedPayload,
  RecordingIngestMessage,
  RecordingWarningPayload,
} from '@stitch/shared/chat/realtime';
import type { StartRecordingResponse, StopRecordingInput } from '@stitch/shared/recordings/types';

type StartCaptureInput = Pick<
  StartRecordingResponse,
  | 'recordingId'
  | 'outputPath'
  | 'micDeviceId'
  | 'speakerDeviceId'
  | 'speakerGain'
  | 'audioChunkConfig'
> & {
  serverUrl: string;
};

const capture = createAudioCaptureHandle();

let activeSocket: WebSocket | null = null;
let activeRecordingId: string | null = null;

export function configureRecordingCaptureEnv(): void {
  if (process.env.STITCH_AUDIO_CAPTURE_BIN) {
    return;
  }

  process.env.STITCH_AUDIO_CAPTURE_BIN = resolveNativeBinaryPath();
}

function toIngestUrl(serverUrl: string): string {
  const url = new URL('/recordings/ingest', serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function waitForSocketOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('Recording ingest socket failed to open')), {
      once: true,
    });
  });
}

function sendIngestMessage(ws: WebSocket, message: RecordingIngestMessage): void {
  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error('Recording ingest socket is not open');
  }

  ws.send(JSON.stringify(message));
}

export async function startRecordingCapture(
  input: StartCaptureInput,
  getWindow: () => BrowserWindow | null,
): Promise<void> {
  if (activeSocket || activeRecordingId || capture.getActive()) {
    throw new Error('Recording capture is already running');
  }

  const ws = new WebSocket(toIngestUrl(input.serverUrl));
  await waitForSocketOpen(ws);

  try {
    sendIngestMessage(ws, {
      type: 'start',
      recordingId: input.recordingId,
      audioChunkConfig: input.audioChunkConfig,
    });

    await capture.start({
      outputPath: input.outputPath,
      channels: 1,
      micDeviceId: input.micDeviceId,
      speakerDeviceId: input.speakerDeviceId,
      speakerGain: input.speakerGain,
      audioChunkConfig: input.audioChunkConfig,
    });

    activeSocket = ws;
    activeRecordingId = input.recordingId;
    capture.onEvent((event) => {
      if (event.type === 'audioChunk') {
        sendIngestMessage(ws, {
          type: 'chunk',
          recordingId: input.recordingId,
          source: event.source,
          samplesB64: event.samplesB64,
          sampleRateHz: event.sampleRateHz,
          numSamples: event.numSamples,
        });
        return;
      }

      const webContents = getWindow()?.webContents;
      if (!webContents || webContents.isDestroyed()) {
        return;
      }

      if (event.type === 'warning') {
        const payload: RecordingWarningPayload = { code: event.code, message: event.message };
        webContents.send('recording:warning', payload);
      } else if (event.type === 'deviceChanged') {
        const payload: RecordingDeviceChangedPayload = {
          kind: event.kind,
          deviceName: event.deviceName,
        };
        webContents.send('recording:device-changed', payload);
      }
    });
  } catch (error) {
    ws.close();
    activeSocket = null;
    activeRecordingId = null;
    throw error;
  }
}

export async function stopRecordingCapture(): Promise<StopRecordingInput> {
  const ws = activeSocket;
  const recordingId = activeRecordingId;

  activeSocket = null;
  activeRecordingId = null;

  try {
    const result = await capture.stop();

    if (ws && recordingId && ws.readyState === WebSocket.OPEN) {
      sendIngestMessage(ws, { type: 'stop', recordingId });
    }

    return {
      durationMs: result?.durationMs ?? null,
      fileSizeBytes: result?.fileSizeBytes ?? null,
    };
  } finally {
    ws?.close();
  }
}

export function listRecordingDevices() {
  return capture.listDevices();
}

export function checkRecordingPermissions() {
  return capture.checkPermissions();
}
