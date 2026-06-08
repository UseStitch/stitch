import type { TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import type { STTAdapter, STTConnection } from '@/stt/adapter-iface.js';
import { createManagedConnection } from '@/stt/base-adapter.js';
import { getModelDescriptor } from '@/stt/models.js';
import type { ModelDescriptor, STTConnectionConfig } from '@/stt/types.js';
import { createWsTransport, type WsMessageResult } from '@/stt/ws-transport.js';

const log = Log.create({ service: 'stt.openai' });

const OPENAI_REALTIME_BASE_URL = 'wss://api.openai.com/v1/realtime';

type OpenAIRealtimeMessage =
  | { type: 'session.created' }
  | { type: 'session.updated' }
  | { type: 'input_audio_buffer.speech_started' }
  | { type: 'input_audio_buffer.speech_stopped' }
  | { type: 'conversation.item.input_audio_transcription.delta'; delta: string }
  | { type: 'conversation.item.input_audio_transcription.completed'; transcript: string }
  | { type: 'error'; error: { type: string; message: string; code?: string } };

function createOpenAIMessageParser(sessionStartMs: number) {
  return function parseMessage(data: string): WsMessageResult | null {
    const msg = JSON.parse(data) as OpenAIRealtimeMessage;

    switch (msg.type) {
      case 'conversation.item.input_audio_transcription.delta': {
        const transcript: TranscriptEvent = { kind: 'partial', text: msg.delta };
        return { transcript };
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const transcript: TranscriptEvent = { kind: 'final', text: msg.transcript };
        const usage: STTUsage = { durationMs: Date.now() - sessionStartMs };
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

  get models(): ModelDescriptor[] {
    return [getModelDescriptor('openai', 'gpt-realtime-whisper')].filter(
      (m): m is ModelDescriptor => m !== null,
    );
  },

  async connect(config: STTConnectionConfig): Promise<STTConnection> {
    return createManagedConnection({
      buffer: config.buffer,
      reconnect: config.reconnect,
      isFatal: isFatalOpenAI,
      openConnection: () => createOpenAITransport(config),
    });
  },
};
