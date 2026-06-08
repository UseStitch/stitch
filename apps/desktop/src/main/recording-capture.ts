import { createAudioCaptureHandle, resolveNativeBinaryPath } from '@stitch/audio-capture';
import type {
  RecordingDeviceChangedPayload,
  RecordingWarningPayload,
} from '@stitch/shared/chat/realtime';
import type { StartRecordingResponse, StopRecordingInput } from '@stitch/shared/recordings/types';
import type { SttInboundMessage, SttOutboundMessage } from '@stitch/shared/stt/types';

import type { BrowserWindow } from 'electron';

type StartCaptureInput = Pick<
  StartRecordingResponse,
  | 'recordingId'
  | 'outputPath'
  | 'micDeviceId'
  | 'speakerDeviceId'
  | 'speakerGain'
  | 'audioChunkConfig'
  | 'stt'
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

function toSttStreamUrl(serverUrl: string): string {
  const url = new URL('/stt/stream', serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function waitForSocketOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('STT stream socket failed to open')), {
      once: true,
    });
  });
}

function sendSttMessage(ws: WebSocket, message: SttInboundMessage): void {
  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error('STT stream socket is not open');
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

  const ws = new WebSocket(toSttStreamUrl(input.serverUrl));
  await waitForSocketOpen(ws);

  try {
    const sttSessionId = `recording-${input.recordingId}`;
    sendSttMessage(ws, {
      type: 'start',
      sttSessionId,
      providerId: input.stt.providerId,
      modelId: input.stt.modelId,
      service: 'meeting-recording',
      recordingId: input.recordingId,
      capabilityRequest: { diarization: 'preferred' },
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
        sendSttMessage(ws, {
          type: 'chunk',
          sttSessionId,
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

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as SttOutboundMessage;
        if (msg.type === 'error') {
          console.error('[recording-stt] error:', msg.code, msg.message);
        }
      } catch {
        // ignore parse errors
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

    // Send stop to STT session before closing the socket
    if (ws && recordingId && ws.readyState === WebSocket.OPEN) {
      sendSttMessage(ws, { type: 'stop', sttSessionId: `recording-${recordingId}` });
    }

    return {
      durationMs: result?.durationMs ?? null,
      fileSizeBytes: result?.fileSizeBytes ?? null,
    };
  } finally {
    // Give a brief moment for the stop message to send before closing
    setTimeout(() => ws?.close(), 500);
  }
}

export function listRecordingDevices() {
  return capture.listDevices();
}

export function checkRecordingPermissions() {
  return capture.checkPermissions();
}
