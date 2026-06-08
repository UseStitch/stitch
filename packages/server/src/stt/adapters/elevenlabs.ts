import type { AudioChunk, TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import type { STTAdapter, STTConnection } from '@/stt/adapter-iface.js';
import { createManagedConnection, type RawConnection } from '@/stt/base-adapter.js';
import { getModelDescriptor } from '@/stt/registry.js';
import type { ModelDescriptor, STTConnectionConfig } from '@/stt/types.js';

const log = Log.create({ service: 'stt.elevenlabs' });

const ELEVENLABS_STT_BASE_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';

type ElevenLabsMessage =
  | { type: 'PARTIAL_TRANSCRIPT'; text: string; language?: string }
  | { type: 'COMMITTED_TRANSCRIPT'; text: string; language?: string }
  | {
      type: 'COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS';
      text: string;
      language?: string;
      words: Array<{ text: string; start: number; end: number }>;
    }
  | { type: 'SESSION_STARTED'; session_id: string }
  | { type: 'ERROR'; error: string; code?: string };

function createElevenLabsRawConnection(config: STTConnectionConfig): Promise<RawConnection> {
  return new Promise((resolve, reject) => {
    const transcriptListeners: ((e: TranscriptEvent) => void)[] = [];
    const usageListeners: ((u: STTUsage) => void)[] = [];
    const errorListeners: ((err: Error) => void)[] = [];
    const closeListeners: (() => void)[] = [];

    const params = new URLSearchParams();
    params.set('model_id', config.modelId);
    if (config.language) params.set('language_code', config.language);
    if (config.capabilities.satisfied.word_timestamps !== 'unsupported') {
      params.set('include_timestamps', 'true');
    }

    const url = `${ELEVENLABS_STT_BASE_URL}?${params.toString()}`;

    const ws = new WebSocket(url, {
      headers: {
        'xi-api-key': config.auth.kind === 'apiKey' ? config.auth.key : '',
      },
    } as unknown as string[]);

    let opened = false;
    let sessionStartMs = Date.now();

    ws.addEventListener('open', () => {
      opened = true;
      sessionStartMs = Date.now();

      // Send initial config if keyterms are specified
      if (config.keyterms && config.keyterms.length > 0) {
        ws.send(
          JSON.stringify({
            type: 'configure',
            keyterms: config.keyterms,
          }),
        );
      }

      const conn: RawConnection = {
        send(chunk: AudioChunk) {
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send(
            JSON.stringify({
              type: 'input_audio_chunk',
              audio: chunk.samplesB64,
            }),
          );
        },
        commit() {
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send(JSON.stringify({ type: 'commit' }));
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
        const msg = JSON.parse(String(event.data)) as ElevenLabsMessage;

        switch (msg.type) {
          case 'PARTIAL_TRANSCRIPT': {
            if (!msg.text) break;
            const evt: TranscriptEvent = {
              kind: 'partial',
              text: msg.text,
              language: msg.language,
            };
            for (const cb of transcriptListeners) cb(evt);
            break;
          }
          case 'COMMITTED_TRANSCRIPT': {
            if (!msg.text) break;
            const evt: TranscriptEvent = {
              kind: 'final',
              text: msg.text,
              language: msg.language,
            };
            for (const cb of transcriptListeners) cb(evt);

            const durationMs = Date.now() - sessionStartMs;
            for (const cb of usageListeners) cb({ durationMs });
            break;
          }
          case 'COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS': {
            if (!msg.text) break;
            const evt: TranscriptEvent = {
              kind: 'final',
              text: msg.text,
              language: msg.language,
              words: msg.words.map((w) => ({
                text: w.text,
                startMs: Math.round(w.start * 1000),
                endMs: Math.round(w.end * 1000),
              })),
            };
            for (const cb of transcriptListeners) cb(evt);

            const durationMs = Date.now() - sessionStartMs;
            for (const cb of usageListeners) cb({ durationMs });
            break;
          }
          case 'ERROR': {
            const err = new Error(`ElevenLabs STT: ${msg.error}`);
            (err as Error & { code?: string }).code = msg.code;
            for (const cb of errorListeners) cb(err);
            break;
          }
        }
      } catch (err) {
        log.warn({ error: err }, 'failed to parse ElevenLabs message');
      }
    });

    ws.addEventListener('close', (event) => {
      if (!opened) {
        reject(new Error(`ElevenLabs WebSocket failed to connect: ${event.code} ${event.reason}`));
        return;
      }
      for (const cb of closeListeners) cb();
    });

    ws.addEventListener('error', (event) => {
      const err = new Error(
        `ElevenLabs WebSocket error: ${(event as ErrorEvent).message ?? 'unknown'}`,
      );
      if (!opened) {
        reject(err);
        return;
      }
      for (const cb of errorListeners) cb(err);
    });
  });
}

function isFatalElevenLabs(err: Error): boolean {
  const msg = err.message.toLowerCase();
  const code = (err as Error & { code?: string }).code;

  if (code === 'invalid_api_key' || code === 'quota_exceeded') return true;
  if (msg.includes('401') || msg.includes('403') || msg.includes('quota')) return true;
  if (msg.includes('invalid_model')) return true;

  return false;
}

export const elevenlabsAdapter: STTAdapter = {
  providerId: 'elevenlabs',

  get models(): ModelDescriptor[] {
    return [getModelDescriptor('elevenlabs', 'scribe_v2_realtime')].filter(
      (m): m is ModelDescriptor => m !== null,
    );
  },

  async connect(config: STTConnectionConfig): Promise<STTConnection> {
    return createManagedConnection({
      buffer: config.buffer,
      reconnect: config.reconnect,
      isFatal: isFatalElevenLabs,
      openConnection: () => createElevenLabsRawConnection(config),
    });
  },
};
