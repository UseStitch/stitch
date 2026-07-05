import { createAudioCaptureHandle } from '@stitch/audio-capture';
import type { RecordingDeviceChangedPayload, RecordingWarningPayload } from '@stitch/shared/recordings/events';
import type { StartRecordingResponse, StopRecordingInput } from '@stitch/shared/recordings/types';
import type { SttInboundMessage, SttOutboundMessage } from '@stitch/shared/stt/types';

import { createCaptureRestarter, isRestartTriggerCode, type CaptureRestarter } from './capture-restart.js';

import type { BrowserWindow } from 'electron';

type StartCaptureInput = Pick<
  StartRecordingResponse,
  'recordingId' | 'micDeviceId' | 'speakerDeviceId' | 'audioChunkConfig' | 'stt'
> & { serverUrl: string };

const capture = createAudioCaptureHandle();

let activeSocket: WebSocket | null = null;
let activeRecordingId: string | null = null;
let restarter: CaptureRestarter | null = null;
let captureStartedAtMs: number | null = null;

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
    ws.addEventListener('error', () => reject(new Error('STT stream socket failed to open')), { once: true });
  });
}

function sendSttMessage(ws: WebSocket, message: SttInboundMessage): void {
  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error('STT stream socket is not open');
  }

  ws.send(JSON.stringify(message));
}

type AudioFrameHeader = {
  sttSessionId: string;
  source: 'mic' | 'speaker';
  sampleRateHz: number;
  numSamples: number;
  encoding: 'f32le' | 'pcm_s16le';
};

function sendAudioFrame(ws: WebSocket, header: AudioFrameHeader, pcm: Buffer): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const headerBuf = Buffer.from(JSON.stringify(header), 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(headerBuf.byteLength, 0);
  ws.send(Buffer.concat([lenBuf, headerBuf, pcm]));
}

function sendWarningToRenderer(getWindow: () => BrowserWindow | null, payload: RecordingWarningPayload): void {
  const webContents = getWindow()?.webContents;
  if (!webContents || webContents.isDestroyed()) {
    return;
  }
  webContents.send('recording:warning', payload);
}

function attachCaptureEvents(ws: WebSocket, sttSessionId: string, getWindow: () => BrowserWindow | null): void {
  capture.onEvent((event) => {
    if (event.type === 'audioChunk') {
      sendAudioFrame(
        ws,
        {
          sttSessionId,
          source: event.source,
          sampleRateHz: event.sampleRateHz,
          numSamples: event.numSamples,
          encoding: event.encoding,
        },
        event.pcm,
      );
      return;
    }

    const streamDied = event.type === 'warning' && isRestartTriggerCode(event.code);
    if (streamDied || event.type === 'deviceChanged') {
      restarter?.trigger();
    }

    const webContents = getWindow()?.webContents;
    if (!webContents || webContents.isDestroyed()) {
      return;
    }

    if (event.type === 'warning') {
      const payload: RecordingWarningPayload = { code: event.code, message: event.message };
      webContents.send('recording:warning', payload);
    } else if (event.type === 'deviceChanged') {
      const payload: RecordingDeviceChangedPayload = { kind: event.kind, deviceName: event.deviceName };
      webContents.send('recording:device-changed', payload);
    }
  });
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

    const startInput = {
      sampleRateHz: input.audioChunkConfig.sampleRateHz,
      encoding: input.audioChunkConfig.encoding,
      micDeviceId: input.micDeviceId,
      speakerDeviceId: input.speakerDeviceId,
      echoCancellation: true,
    };

    await capture.start(startInput);

    activeSocket = ws;
    activeRecordingId = input.recordingId;
    captureStartedAtMs = Date.now();

    restarter = createCaptureRestarter({
      restart: async () => {
        await capture.stop();
        await capture.start(startInput);
        attachCaptureEvents(ws, sttSessionId, getWindow);
      },
      onGiveUp: (message) => {
        sendWarningToRenderer(getWindow, { code: 'capture_restart_failed', message });
      },
    });

    attachCaptureEvents(ws, sttSessionId, getWindow);

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
    captureStartedAtMs = null;
    restarter?.cancel();
    restarter = null;
    throw error;
  }
}

export async function stopRecordingCapture(): Promise<StopRecordingInput> {
  const ws = activeSocket;
  const recordingId = activeRecordingId;
  const startedAtMs = captureStartedAtMs;

  activeSocket = null;
  activeRecordingId = null;
  captureStartedAtMs = null;
  restarter?.cancel();
  restarter = null;

  try {
    const result = await capture.stop();

    // Send stop to STT session before closing the socket
    if (ws && recordingId && ws.readyState === WebSocket.OPEN) {
      sendSttMessage(ws, { type: 'stop', sttSessionId: `recording-${recordingId}` });
    }

    // Capture restarts split the native session, so its duration only covers
    // the last segment; the wall-clock duration spans the whole recording.
    return { durationMs: startedAtMs !== null ? Date.now() - startedAtMs : (result?.durationMs ?? null) };
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

export function primeRecordingSystemAudio() {
  return capture.primeSystemAudio();
}
