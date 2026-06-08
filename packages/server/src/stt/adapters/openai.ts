import type { AudioChunk, TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import type { STTAdapter, STTConnection } from '@/stt/adapter-iface.js';
import { createManagedConnection, type RawConnection } from '@/stt/base-adapter.js';
import { getModelDescriptor } from '@/stt/registry.js';
import type { ModelDescriptor, STTConnectionConfig } from '@/stt/types.js';

const log = Log.create({ service: 'stt.openai' });

const OPENAI_REALTIME_BASE_URL = 'wss://api.openai.com/v1/realtime';

type OpenAIRealtimeMessage =
  | { type: 'session.created'; session: Record<string, unknown> }
  | { type: 'session.updated'; session: Record<string, unknown> }
  | { type: 'input_audio_buffer.speech_started' }
  | { type: 'input_audio_buffer.speech_stopped' }
  | { type: 'conversation.item.input_audio_transcription.delta'; delta: string }
  | { type: 'conversation.item.input_audio_transcription.completed'; transcript: string }
  | { type: 'error'; error: { type: string; message: string; code?: string } };

function createOpenAIRawConnection(config: STTConnectionConfig): Promise<RawConnection> {
  return new Promise((resolve, reject) => {
    const transcriptListeners: ((e: TranscriptEvent) => void)[] = [];
    const usageListeners: ((u: STTUsage) => void)[] = [];
    const errorListeners: ((err: Error) => void)[] = [];
    const closeListeners: (() => void)[] = [];

    const url = `${OPENAI_REALTIME_BASE_URL}?intent=transcription&model=${config.modelId}`;

    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${config.auth.kind === 'apiKey' ? config.auth.key : ''}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    } as unknown as string[]);

    let opened = false;
    let sessionStartMs = Date.now();

    ws.addEventListener('open', () => {
      opened = true;

      // Configure session
      const sessionConfig: Record<string, unknown> = {
        type: 'transcription_session.update',
        session: {
          input_audio_format: 'pcm16',
          input_audio_transcription: {
            model: config.modelId,
            language: config.language || undefined,
          },
        },
      };

      if (config.commitStrategy === 'native_vad') {
        (sessionConfig['session'] as Record<string, unknown>)['turn_detection'] = {
          type: 'server_vad',
          threshold: 0.5,
          silence_duration_ms: 500,
        };
      } else {
        (sessionConfig['session'] as Record<string, unknown>)['turn_detection'] = null;
      }

      ws.send(JSON.stringify(sessionConfig));
      sessionStartMs = Date.now();

      const conn: RawConnection = {
        send(chunk: AudioChunk) {
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send(
            JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: chunk.samplesB64,
            }),
          );
        },
        commit() {
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        },
        async close() {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1000, 'client close');
          }
        },
        onTranscript(cb) {
          transcriptListeners.push(cb);
        },
        onUsage(cb) {
          usageListeners.push(cb);
        },
        onError(cb) {
          errorListeners.push(cb);
        },
        onClose(cb) {
          closeListeners.push(cb);
        },
      };

      resolve(conn);
    });

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as OpenAIRealtimeMessage;

        switch (msg.type) {
          case 'conversation.item.input_audio_transcription.delta': {
            const evt: TranscriptEvent = { kind: 'partial', text: msg.delta };
            for (const cb of transcriptListeners) cb(evt);
            break;
          }
          case 'conversation.item.input_audio_transcription.completed': {
            const evt: TranscriptEvent = { kind: 'final', text: msg.transcript };
            for (const cb of transcriptListeners) cb(evt);

            // Emit usage estimate
            const durationMs = Date.now() - sessionStartMs;
            for (const cb of usageListeners) cb({ durationMs });
            break;
          }
          case 'error': {
            const err = new Error(`OpenAI STT: ${msg.error.message}`);
            (err as Error & { code?: string }).code = msg.error.code;
            for (const cb of errorListeners) cb(err);
            break;
          }
        }
      } catch (err) {
        log.warn({ error: err }, 'failed to parse OpenAI realtime message');
      }
    });

    ws.addEventListener('close', (event) => {
      if (!opened) {
        reject(new Error(`OpenAI WebSocket failed to connect: ${event.code} ${event.reason}`));
        return;
      }
      for (const cb of closeListeners) cb();
    });

    ws.addEventListener('error', (event) => {
      const err = new Error(
        `OpenAI WebSocket error: ${(event as ErrorEvent).message ?? 'unknown'}`,
      );
      if (!opened) {
        reject(err);
        return;
      }
      for (const cb of errorListeners) cb(err);
    });
  });
}

function isFatalOpenAI(err: Error): boolean {
  const msg = err.message.toLowerCase();
  const code = (err as Error & { code?: string }).code;

  // Auth errors, invalid model, quota
  if (code === 'invalid_api_key' || code === 'insufficient_quota') return true;
  if (msg.includes('401') || msg.includes('403') || msg.includes('quota')) return true;
  if (msg.includes('invalid_model') || msg.includes('model_not_found')) return true;

  return false;
}

export const openaiAdapter: STTAdapter = {
  providerId: 'openai',

  get models(): ModelDescriptor[] {
    return [
      getModelDescriptor('openai', 'gpt-4o-transcribe'),
      getModelDescriptor('openai', 'gpt-4o-mini-transcribe'),
    ].filter((m): m is ModelDescriptor => m !== null);
  },

  async connect(config: STTConnectionConfig): Promise<STTConnection> {
    return createManagedConnection({
      buffer: config.buffer,
      reconnect: config.reconnect,
      isFatal: isFatalOpenAI,
      openConnection: () => createOpenAIRawConnection(config),
    });
  },
};
