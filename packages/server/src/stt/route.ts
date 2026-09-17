import { Hono } from 'hono';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';
import {
  SttAudioFrameHeaderSchema,
  SttInboundMessageSchema,
  SttStartMessageSchema,
  type SttInboundMessage,
  type SttOutboundMessage,
} from '@stitch/shared/stt/types';

import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { routeSchemas } from '@/lib/route-schemas.js';
import { pushTranscriptEvent, startTranscriptCollection } from '@/recordings/transcript-store.js';
import { createSTTSession, STTSessionError, type STTSession } from '@/stt/session.js';
import type { createNodeWebSocket } from '@hono/node-ws';

type UpgradeWebSocket = ReturnType<typeof createNodeWebSocket>['upgradeWebSocket'];

const log = Log.create({ service: 'stt.route' });

const startMessageSchema = SttStartMessageSchema.extend({ recordingId: routeSchemas.recordingId.optional() });

function parseMessage(data: unknown): SttInboundMessage | null {
  if (typeof data !== 'string') return null;
  try {
    const message = SttInboundMessageSchema.parse(JSON.parse(data));
    return message.type === 'start' ? (startMessageSchema.parse(message) as SttInboundMessage) : message;
  } catch {
    return null;
  }
}

function toBuffer(data: ArrayBuffer | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(data as ArrayBuffer);
}

function parseAudioFrame(
  data: ArrayBuffer | Buffer | Uint8Array,
): Extract<SttInboundMessage, { type: 'chunk' }> | null {
  const buf = toBuffer(data);
  if (buf.byteLength < 4) return null;

  const headerLen = buf.readUInt32LE(0);
  if (headerLen <= 0 || 4 + headerLen > buf.byteLength) return null;

  let header: z.infer<typeof SttAudioFrameHeaderSchema>;
  try {
    header = SttAudioFrameHeaderSchema.parse(JSON.parse(buf.toString('utf8', 4, 4 + headerLen)));
  } catch {
    return null;
  }

  const pcm = buf.subarray(4 + headerLen);
  return {
    type: 'chunk',
    sttSessionId: header.sttSessionId,
    source: header.source,
    samplesB64: pcm.toString('base64'),
    sampleRateHz: header.sampleRateHz,
    numSamples: header.numSamples,
  };
}

type WsSender = { send(data: string | ArrayBuffer): void; close(code: number, reason: string): void };

function send(ws: WsSender, msg: SttOutboundMessage): void {
  ws.send(JSON.stringify(msg));
}

type SessionState = {
  session: STTSession | null;
  inputEncoding: 'f32le' | 'pcm_s16le';
  recordingId: PrefixedString<'rec'> | null;
};

async function handleStart(
  message: Extract<SttInboundMessage, { type: 'start' }>,
  ws: WsSender,
  state: SessionState,
): Promise<void> {
  if (state.session) {
    send(ws, {
      type: 'error',
      sttSessionId: message.sttSessionId,
      message: 'Session already active',
      code: 'session_active',
    });
    return;
  }

  state.inputEncoding = message.audioChunkConfig.encoding;
  state.recordingId = (message.recordingId as PrefixedString<'rec'> | undefined) ?? null;

  try {
    const session = await createSTTSession({
      sttSessionId: message.sttSessionId,
      providerId: message.providerId,
      modelId: message.modelId,
      service: message.service,
      capabilityRequest: message.capabilityRequest,
      language: message.language,
      keyterms: message.keyterms,
      inputEncoding: state.inputEncoding,
      inputSampleRateHz: message.audioChunkConfig.sampleRateHz,
    });

    state.session = session;

    // Start in-memory transcript collection for meeting recordings
    if (message.service === 'meeting-recording' && state.recordingId) {
      startTranscriptCollection(state.recordingId);
    }

    session.onTranscript((evt) => {
      send(ws, {
        type: 'transcript',
        sttSessionId: message.sttSessionId,
        id: evt.id,
        kind: evt.kind,
        text: evt.text,
        offsetMs: evt.offsetMs,
        speaker: evt.speaker,
        words: evt.words,
        language: evt.language,
      });

      // Emit SSE event for recording transcripts so the FE can display them live
      if (message.service === 'meeting-recording' && state.recordingId) {
        const source = evt.source;

        internalBus.emit('recording.transcript.entry', {
          recordingId: state.recordingId,
          kind: evt.kind,
          source,
          speaker: typeof evt.speaker === 'string' ? evt.speaker : 'Unknown',
          content: evt.text,
          offsetMs: evt.offsetMs,
        });

        // Accumulate all transcript events (partial + final) in the store for DB persistence
        pushTranscriptEvent(state.recordingId, {
          kind: evt.kind,
          source,
          speaker: typeof evt.speaker === 'string' ? evt.speaker : 'Unknown',
          content: evt.text,
          offsetMs: evt.offsetMs,
        });
      }
    });

    session.onError((err) => {
      log.error({ error: err, sttSessionId: message.sttSessionId }, 'session adapter error');
      send(ws, { type: 'error', sttSessionId: message.sttSessionId, message: err.message, code: 'adapter_error' });
    });

    session.onUnrecoverable((reason) => {
      log.error({ reason, sttSessionId: message.sttSessionId }, 'session unrecoverable');
      send(ws, { type: 'unrecoverable', sttSessionId: message.sttSessionId, reason });

      if (message.service === 'meeting-recording' && state.recordingId) {
        internalBus.emit('recording.unrecoverable', { recordingId: state.recordingId, reason });
      }
    });

    send(ws, { type: 'ready', sttSessionId: message.sttSessionId, capabilityResolution: session.capabilityResolution });
  } catch (err) {
    const code = err instanceof STTSessionError ? err.code : 'session_start_failed';
    const msg = Error.isError(err) ? err.message : 'Unknown error';
    log.error({ error: err, sttSessionId: message.sttSessionId }, 'failed to start STT session');
    send(ws, { type: 'error', sttSessionId: message.sttSessionId, message: msg, code });
    ws.close(4000, code);
  }
}

function handleChunk(message: Extract<SttInboundMessage, { type: 'chunk' }>, state: SessionState): void {
  if (!state.session || state.session.sttSessionId !== message.sttSessionId) return;
  state.session.feedAudio(message.source, {
    samplesB64: message.samplesB64,
    sampleRateHz: message.sampleRateHz,
    numSamples: message.numSamples,
    encoding: state.inputEncoding,
  });
}

function handleCommit(message: Extract<SttInboundMessage, { type: 'commit' }>, state: SessionState): void {
  if (!state.session || state.session.sttSessionId !== message.sttSessionId) return;
  state.session.commit();
}

async function handleStop(
  message: Extract<SttInboundMessage, { type: 'stop' }>,
  ws: WsSender,
  state: SessionState,
): Promise<void> {
  if (!state.session || state.session.sttSessionId !== message.sttSessionId) return;

  const currentSession = state.session;
  const sessionId = message.sttSessionId;
  state.session = null;

  try {
    const result = await currentSession.stop();
    log.info({ sttSessionId: sessionId, costUsd: result.costUsd }, 'session done');
    send(ws, { type: 'done', sttSessionId: sessionId, costUsd: result.costUsd, usage: result.usage });
  } catch (err) {
    log.error({ error: err, sttSessionId: sessionId }, 'error stopping STT session');
    send(ws, {
      type: 'error',
      sttSessionId: sessionId,
      message: Error.isError(err) ? err.message : 'Unknown error',
      code: 'stop_failed',
    });
  }
}

export function createSttRouter(upgradeWebSocket: UpgradeWebSocket): Hono {
  const router = new Hono();

  router.get(
    '/stream',
    upgradeWebSocket(() => {
      const state: SessionState = { session: null, inputEncoding: 'pcm_s16le', recordingId: null };

      return {
        onOpen() {
          log.info('client WebSocket connected');
        },

        onMessage(event, ws) {
          if (typeof event.data !== 'string') {
            const frame = parseAudioFrame(event.data as ArrayBuffer | Buffer | Uint8Array);
            if (frame) handleChunk(frame, state);
            return;
          }

          const message = parseMessage(event.data);
          if (!message) {
            send(ws, { type: 'error', sttSessionId: '', message: 'Invalid message format', code: 'invalid_message' });
            return;
          }

          switch (message.type) {
            case 'start':
              void handleStart(message, ws, state);
              break;
            case 'chunk':
              handleChunk(message, state);
              break;
            case 'commit':
              handleCommit(message, state);
              break;
            case 'stop':
              void handleStop(message, ws, state);
              break;
          }
        },

        onClose() {
          if (!state.session) {
            return;
          }

          state.session.stop().catch((err) => {
            log.warn({ error: err }, 'error during session cleanup on WS close');
          });
          state.session = null;
        },
      };
    }),
  );

  return router;
}
