import type { TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import { getModelDescriptor } from '@/models/stt/service.js';
import type { STTAdapter, STTConnection } from '@/stt/adapter-iface.js';
import { createManagedConnection } from '@/stt/base-adapter.js';
import type { ModelDescriptor, STTConnectionConfig } from '@/stt/types.js';
import { createWsTransport, type WsMessageResult } from '@/stt/ws-transport.js';

const log = Log.create({ service: 'stt.openai' });

const OPENAI_REALTIME_BASE_URL = 'wss://api.openai.com/v1/realtime';

type OpenAIRealtimeMessage =
  | { type: 'session.created' }
  | { type: 'session.updated' }
  | { type: 'input_audio_buffer.speech_started' }
  | { type: 'input_audio_buffer.speech_stopped' }
  | {
      type: 'conversation.item.input_audio_transcription.delta';
      delta: string;
      item_id?: string;
      content_index?: number;
    }
  | {
      type: 'conversation.item.input_audio_transcription.completed';
      transcript: string;
      item_id?: string;
      content_index?: number;
      usage?:
        | {
            type: 'tokens';
            input_tokens: number;
            output_tokens: number;
            input_token_details?: { audio_tokens?: number; text_tokens?: number };
          }
        | { type: 'duration'; seconds: number };
    }
  | { type: 'error'; error: { type: string; message: string; code?: string } };

function parseUsage(
  usage: Extract<
    OpenAIRealtimeMessage,
    { type: 'conversation.item.input_audio_transcription.completed' }
  >['usage'],
  durationMs: number,
): STTUsage {
  if (!usage) return { durationMs };

  if (usage.type === 'tokens') {
    return {
      durationMs,
      audioInputTokens: usage.input_token_details?.audio_tokens ?? usage.input_tokens,
      textOutputTokens: usage.output_tokens,
    };
  }

  return { durationMs: Math.round(usage.seconds * 1000) };
}

export function createOpenAIMessageParser(sessionStartMs: number) {
  // Monotonic offset tracker: OpenAI doesn't provide word timestamps,
  // so we use elapsed time since session start as the offset.
  // We track the last offset to ensure monotonicity even if messages arrive out of order.
  let lastOffsetMs = 0;

  return function parseMessage(data: string): WsMessageResult | null {
    const msg = JSON.parse(data) as OpenAIRealtimeMessage;

    switch (msg.type) {
      case 'conversation.item.input_audio_transcription.delta': {
        const offsetMs = Math.max(Date.now() - sessionStartMs, lastOffsetMs);
        lastOffsetMs = offsetMs;
        const transcript: TranscriptEvent = { kind: 'partial', text: msg.delta, offsetMs };
        return { transcript };
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const offsetMs = Math.max(Date.now() - sessionStartMs, lastOffsetMs + 1);
        lastOffsetMs = offsetMs;
        const transcript: TranscriptEvent = { kind: 'final', text: msg.transcript, offsetMs };
        const usage = parseUsage(msg.usage, Date.now() - sessionStartMs);
        return { transcript, usage };
      }
      case 'error': {
        log.error({ error: msg.error }, 'OpenAI STT error message');
        const err = new Error(`OpenAI STT: ${msg.error.message}`);
        (err as Error & { code?: string }).code = msg.error.code;
        return { error: err };
      }
      default:
        return null;
    }
  };
}

function buildSessionConfig(config: STTConnectionConfig): string {
  const audioInput: Record<string, unknown> = {
    format: { type: 'audio/pcm', rate: 24000 },
    transcription: {
      model: config.modelId,
      ...(config.language ? { language: config.language } : {}),
    },
    turn_detection: null,
  };

  return JSON.stringify({
    type: 'session.update',
    session: {
      type: 'transcription',
      audio: { input: audioInput },
    },
  });
}

function isFatalOpenAI(err: Error): boolean {
  const msg = err.message.toLowerCase();
  const code = (err as Error & { code?: string }).code;

  if (code === 'invalid_api_key' || code === 'insufficient_quota') return true;
  if (msg.includes('401') || msg.includes('403') || msg.includes('quota')) return true;
  if (msg.includes('invalid_model') || msg.includes('model_not_found')) return true;

  return false;
}

function createOpenAITransport(config: STTConnectionConfig) {
  const sessionStartMs = Date.now();

  return createWsTransport(
    {
      url: `${OPENAI_REALTIME_BASE_URL}?intent=transcription`,
      headers: {
        Authorization: `Bearer ${config.auth.kind === 'apiKey' ? config.auth.key : ''}`,
      },
      onReady: () => [buildSessionConfig(config)],
      parseMessage: createOpenAIMessageParser(sessionStartMs),
      label: 'OpenAI',
    },
    (chunk) =>
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: chunk.samplesB64,
      }),
    () => JSON.stringify({ type: 'input_audio_buffer.commit' }),
  );
}

export const openaiAdapter: STTAdapter = {
  providerId: 'openai',

  async models(): Promise<ModelDescriptor[]> {
    const descriptor = await getModelDescriptor('openai', 'gpt-realtime-whisper');
    return descriptor ? [descriptor] : [];
  },

  async connect(config: STTConnectionConfig): Promise<STTConnection> {
    return createManagedConnection({
      buffer: config.buffer,
      reconnect: config.reconnect,
      partialStrategy: config.partialStrategy,
      isFatal: isFatalOpenAI,
      openConnection: () => createOpenAITransport(config),
    });
  },
};
