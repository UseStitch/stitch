import type { AudioChunk, TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import type { STTAdapter, STTConnection } from '@/stt/adapter-iface.js';
import { createManagedConnection, type RawConnection } from '@/stt/base-adapter.js';
import { getModelDescriptor } from '@/stt/registry.js';
import type { ModelDescriptor, STTConnectionConfig } from '@/stt/types.js';

const log = Log.create({ service: 'stt.elevenlabs' });

const ELEVENLABS_STT_BASE_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';

type ElevenLabsMessage =
  | { message_type: 'partial_transcript'; text: string; language_code?: string }
  | { message_type: 'committed_transcript'; text: string; language_code?: string }
  | {
      message_type: 'committed_transcript_with_timestamps';
      text: string;
      language_code?: string;
      words: Array<{ text: string; start: number; end: number }>;
    }
  | { message_type: 'session_started'; session_id: string }
  | { message_type: string; error: string; code?: string };

function createElevenLabsRawConnection(config: STTConnectionConfig): Promise<RawConnection> {
  return new Promise((resolve, reject) => {
    const transcriptListeners: ((e: TranscriptEvent) => void)[] = [];
    const usageListeners: ((u: STTUsage) => void)[] = [];
    const errorListeners: ((err: Error) => void)[] = [];
    const closeListeners: (() => void)[] = [];

    const params = new URLSearchParams();
    params.set('model_id', config.modelId);
    params.set('audio_format', 'pcm_16000');
    params.set('commit_strategy', 'manual');
    if (config.language) params.set('language_code', config.language);
    if (config.capabilities.satisfied.word_timestamps !== 'unsupported') {
      params.set('include_timestamps', 'true');
    }

    const url = `${ELEVENLABS_STT_BASE_URL}?${params.toString()}`;
    log.info(
      { url: url.replace(/xi-api-key=[^&]+/, 'xi-api-key=***') },
      'connecting to ElevenLabs STT',
    );

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
      log.info({ modelId: config.modelId }, 'ElevenLabs STT WebSocket opened');

      // Send initial config if keyterms are specified
      if (config.keyterms && config.keyterms.length > 0) {
        ws.send(
          JSON.stringify({
            message_type: 'configure',
            keyterms: config.keyterms,
          }),
        );
        log.info({ keyterms: config.keyterms }, 'sent keyterms config');
      }

      const conn: RawConnection = {
        send(chunk: AudioChunk) {
          if (ws.readyState !== WebSocket.OPEN) {
            log.warn({ readyState: ws.readyState }, 'ElevenLabs WS not open, dropping chunk');
            return;
          }
          ws.send(
            JSON.stringify({
              message_type: 'input_audio_chunk',
              audio_base_64: chunk.samplesB64,
              commit: false,
              sample_rate: chunk.sampleRateHz,
            }),
          );
        },
        commit() {
          if (ws.readyState !== WebSocket.OPEN) return;
          log.info('sending commit to ElevenLabs');
          ws.send(JSON.stringify({ message_type: 'commit' }));
        },
        async close() {
          log.info('closing ElevenLabs WS connection');
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
        log.info({ type: msg.message_type }, 'received message from ElevenLabs');

        switch (msg.message_type) {
          case 'session_started': {
            log.info(
              { sessionId: (msg as { message_type: string; session_id: string }).session_id },
              'ElevenLabs session started',
            );
            break;
          }
          case 'partial_transcript': {
            if (!('text' in msg) || !msg.text) break;
            const evt: TranscriptEvent = {
              kind: 'partial',
              text: msg.text,
              language: msg.language_code,
            };
            for (const cb of transcriptListeners) cb(evt);
            break;
          }
          case 'committed_transcript': {
            if (!('text' in msg) || !msg.text) break;
            const evt: TranscriptEvent = {
              kind: 'final',
              text: msg.text,
              language: msg.language_code,
            };
            for (const cb of transcriptListeners) cb(evt);

            const durationMs = Date.now() - sessionStartMs;
            for (const cb of usageListeners) cb({ durationMs });
            break;
          }
          case 'committed_transcript_with_timestamps': {
            if (!('text' in msg) || !msg.text) break;
            const words = 'words' in msg ? msg.words : [];
            const evt: TranscriptEvent = {
              kind: 'final',
              text: msg.text,
              language: msg.language_code,
              words: words.map((w) => ({
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
          default: {
            if ('error' in msg && msg.error) {
              const err = new Error(`ElevenLabs STT: ${msg.error}`);
              (err as Error & { code?: string }).code = msg.code;
              for (const cb of errorListeners) cb(err);
            } else {
              log.debug({ messageType: msg.message_type }, 'unhandled ElevenLabs message type');
            }
          }
        }
      } catch (err) {
        log.warn({ error: err }, 'failed to parse ElevenLabs message');
      }
    });

    ws.addEventListener('close', (event) => {
      log.info({ code: event.code, reason: event.reason, opened }, 'ElevenLabs WS closed');
      if (!opened) {
        reject(new Error(`ElevenLabs WebSocket failed to connect: ${event.code} ${event.reason}`));
        return;
      }
      for (const cb of closeListeners) cb();
    });

    ws.addEventListener('error', (event) => {
      const message = (event as ErrorEvent).message ?? 'unknown';
      log.error({ message }, 'ElevenLabs WebSocket error event');
      const err = new Error(`ElevenLabs WebSocket error: ${message}`);
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
