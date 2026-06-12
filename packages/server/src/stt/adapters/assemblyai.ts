import type { TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import { getModelDescriptor } from '@/models/stt/service.js';
import type { STTAdapter, STTConnection } from '@/stt/adapter-iface.js';
import { createManagedConnection } from '@/stt/base-adapter.js';
import type { ModelDescriptor, STTConnectionConfig } from '@/stt/types.js';
import { createWsTransport, type WsMessageResult } from '@/stt/ws-transport.js';

const log = Log.create({ service: 'stt.assemblyai' });

const ASSEMBLYAI_STREAMING_URL = 'wss://streaming.assemblyai.com/v3/ws';

// https://www.assemblyai.com/docs/streaming/
type AssemblyAIMessage =
  | { type: 'Begin'; id: string; expires_at: number }
  | { type: 'SpeechStarted'; timestamp: number; confidence: number }
  | {
      type: 'Turn';
      turn_order: number;
      end_of_turn: boolean;
      transcript: string;
      end_of_turn_confidence: number;
      words: Array<{ text: string; start: number; end: number; confidence: number }>;
      utterance: string | null;
    }
  | { type: 'Termination'; audio_duration_seconds: number; session_duration_seconds: number }
  | { type: string };

function createAssemblyAIMessageParser(sessionStartMs: number) {
  return function parseMessage(data: string): WsMessageResult | null {
    const msg = JSON.parse(data) as AssemblyAIMessage;

    switch (msg.type) {
      case 'Begin':
        return null;

      case 'SpeechStarted':
        return null;

      case 'Turn': {
        if (!('transcript' in msg) || !msg.transcript) return null;

        const words =
          'words' in msg && msg.words
            ? msg.words.map((w) => ({
                text: w.text,
                startMs: Math.round(w.start),
                endMs: Math.round(w.end),
              }))
            : undefined;

        const offsetMs = words && words.length > 0 ? words[0].startMs : Date.now() - sessionStartMs;

        if (msg.end_of_turn) {
          const transcript: TranscriptEvent = {
            kind: 'final',
            text: msg.transcript,
            offsetMs,
            words,
          };
          const usage: STTUsage = { durationMs: Date.now() - sessionStartMs };
          return { transcript, usage };
        }

        const transcript: TranscriptEvent = {
          kind: 'partial',
          text: msg.transcript,
          offsetMs,
        };
        return { transcript };
      }

      case 'Termination':
        return null;

      default:
        if ('error' in msg) {
          const error = (msg as { error?: string; error_code?: number | string }).error;
          const errorCode = (msg as { error?: string; error_code?: number | string }).error_code;
          log.error({ error, errorCode }, 'AssemblyAI error');
          const err = new Error(`AssemblyAI: ${error ?? msg.type}`);
          (err as Error & { code?: string }).code = String(errorCode ?? '');
          return { error: err };
        }
        log.warn({ messageType: msg.type }, 'unhandled AssemblyAI message type');
        return null;
    }
  };
}

function buildAssemblyAIUrl(config: STTConnectionConfig): string {
  const params = new URLSearchParams();
  params.set('sample_rate', String(config.inputFormat.sampleRateHz));
  params.set('speech_model', config.modelId);

  if (config.keyterms && config.keyterms.length > 0) {
    params.set('keyterms_prompt', config.keyterms.join(','));
  }

  return `${ASSEMBLYAI_STREAMING_URL}?${params.toString()}`;
}

function isFatalAssemblyAI(err: Error): boolean {
  const msg = err.message.toLowerCase();
  const code = (err as Error & { code?: string }).code ?? '';

  // WS close code 1008 = unauthorized (can come as string "1008" from JSON error_code)
  if (code === '1008' || msg.includes('1008') || msg.includes('unauthorized')) return true;
  if (msg.includes('401') || msg.includes('403')) return true;
  // Session expired (3-hour cap)
  if (code === '3008' || msg.includes('3008')) return true;
  // Too many concurrent sessions
  if (code === '3009' || msg.includes('3009')) return true;
  // Invalid request
  if (code === '3006' || msg.includes('invalid')) return true;

  return false;
}

function createAssemblyAITransport(config: STTConnectionConfig) {
  const sessionStartMs = Date.now();

  return createWsTransport(
    {
      url: buildAssemblyAIUrl(config),
      // AssemblyAI auth: raw key, no "Bearer" prefix
      headers: {
        Authorization: config.auth.kind === 'apiKey' ? config.auth.key : '',
      },
      onReady: () => [],
      parseMessage: createAssemblyAIMessageParser(sessionStartMs),
      label: 'AssemblyAI',
    },
    // AssemblyAI v3 accepts raw binary PCM16 frames directly
    (chunk) => Buffer.from(chunk.samplesB64, 'base64'),
    // ForceEndpoint finalizes the current turn
    () => JSON.stringify({ type: 'ForceEndpoint' }),
  );
}

export const assemblyaiAdapter: STTAdapter = {
  providerId: 'assemblyai',

  async models(): Promise<ModelDescriptor[]> {
    const descriptor = await getModelDescriptor('assemblyai', 'u3-rt-pro');
    return descriptor ? [descriptor] : [];
  },

  async connect(config: STTConnectionConfig): Promise<STTConnection> {
    return createManagedConnection({
      buffer: config.buffer,
      reconnect: config.reconnect,
      partialStrategy: config.partialStrategy,
      isFatal: isFatalAssemblyAI,
      openConnection: () => createAssemblyAITransport(config),
    });
  },
};
