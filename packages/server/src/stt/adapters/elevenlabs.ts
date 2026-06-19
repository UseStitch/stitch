import type { TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import { getModelDescriptor } from '@/models/stt/service.js';
import type { STTAdapter, STTConnection } from '@/stt/adapter-iface.js';
import { createManagedConnection, type STTErrorClassification } from '@/stt/base-adapter.js';
import type { ModelDescriptor, STTConnectionConfig } from '@/stt/types.js';
import { createWsTransport, type WsMessageResult } from '@/stt/ws-transport.js';

const log = Log.create({ service: 'stt.elevenlabs' });

const ELEVENLABS_STT_BASE_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
const CREDENTIALS_ERROR_REASON =
  'Invalid transcription API credentials. Please check your settings.';
const QUOTA_ERROR_REASON = 'Transcription quota exceeded. Please check your billing.';
const TERMS_ERROR_REASON = 'ElevenLabs transcription terms must be accepted before recording.';
const SESSION_LIMIT_REASON = 'ElevenLabs transcription session reached its time limit.';

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
  | { message_type: string; error?: string; code?: string };

function createElevenLabsMessageParser(sessionStartMs: number, includeTimestamps: boolean) {
  return function parseMessage(data: string): WsMessageResult | null {
    const msg = JSON.parse(data) as ElevenLabsMessage;

    switch (msg.message_type) {
      case 'session_started':
        return null;

      case 'partial_transcript': {
        if (!('text' in msg) || !msg.text) return null;
        const transcript: TranscriptEvent = {
          kind: 'partial',
          text: msg.text,
          offsetMs: Date.now() - sessionStartMs,
          language: msg.language_code,
        };
        return { transcript };
      }

      case 'committed_transcript': {
        // When timestamps are enabled, ElevenLabs also sends
        // committed_transcript_with_timestamps for the same segment.
        // Skip this one to avoid emitting a duplicate final.
        if (includeTimestamps) return null;
        if (!('text' in msg) || !msg.text) return null;
        const transcript: TranscriptEvent = {
          kind: 'final',
          text: msg.text,
          offsetMs: Date.now() - sessionStartMs,
          language: msg.language_code,
        };
        const usage: STTUsage = { durationMs: Date.now() - sessionStartMs };
        return { transcript, usage };
      }

      case 'committed_transcript_with_timestamps': {
        if (!('text' in msg) || !msg.text) return null;
        const words = 'words' in msg ? msg.words : [];
        const parsedWords = words.map((w) => ({
          text: w.text,
          startMs: Math.round(w.start * 1000),
          endMs: Math.round(w.end * 1000),
        }));
        // Use the first word's start time as the authoritative offset
        const offsetMs =
          parsedWords.length > 0 ? parsedWords[0].startMs : Date.now() - sessionStartMs;
        const transcript: TranscriptEvent = {
          kind: 'final',
          text: msg.text,
          offsetMs,
          language: msg.language_code,
          words: parsedWords,
        };
        const usage: STTUsage = { durationMs: Date.now() - sessionStartMs };
        return { transcript, usage };
      }

      default: {
        if ('error' in msg && msg.error) {
          const err = new Error(`ElevenLabs STT: ${msg.error}`);
          (err as Error & { code?: string }).code = msg.code ?? msg.message_type;
          return { error: err };
        }
        log.debug({ messageType: msg.message_type }, 'unhandled ElevenLabs message type');
        return null;
      }
    }
  };
}

function shouldIncludeTimestamps(config: STTConnectionConfig): boolean {
  return config.capabilities.satisfied.word_timestamps !== 'unsupported';
}

function buildElevenLabsUrl(config: STTConnectionConfig): string {
  const params = new URLSearchParams();
  params.set('model_id', config.modelId);
  params.set('audio_format', 'pcm_16000');
  // Use ElevenLabs native VAD to auto-segment utterances on silence.
  // With 'manual', committed transcripts only fire when we send a commit
  // (or after a 90s auto-commit), collapsing entire turns into one segment.
  if (config.commitStrategy === 'native_vad') {
    params.set('commit_strategy', 'vad');
    params.set('vad_silence_threshold_secs', '1.5');
    params.set('vad_threshold', '0.4');
    params.set('min_speech_duration_ms', '100');
    params.set('min_silence_duration_ms', '100');
  } else {
    params.set('commit_strategy', 'manual');
  }
  if (config.language) params.set('language_code', config.language);
  if (shouldIncludeTimestamps(config)) {
    params.set('include_timestamps', 'true');
  }
  return `${ELEVENLABS_STT_BASE_URL}?${params.toString()}`;
}

function buildKeytermsConfig(keyterms: string[]): string {
  return JSON.stringify({
    message_type: 'configure',
    keyterms,
  });
}

function classifyElevenLabsError(err: Error): STTErrorClassification {
  const msg = err.message.toLowerCase();
  const code = (err as Error & { code?: string }).code ?? '';

  if (
    code === 'auth_error' ||
    code === 'invalid_api_key' ||
    msg.includes('must be authenticated') ||
    msg.includes('401') ||
    msg.includes('403')
  ) {
    return { fatal: true, reason: CREDENTIALS_ERROR_REASON };
  }

  if (code === 'quota_exceeded' || msg.includes('quota')) {
    return { fatal: true, reason: QUOTA_ERROR_REASON };
  }

  if (code === 'unaccepted_terms') {
    return { fatal: true, reason: TERMS_ERROR_REASON };
  }

  if (code === 'session_time_limit_exceeded') {
    return { fatal: true, reason: SESSION_LIMIT_REASON };
  }

  return { fatal: false };
}

function createElevenLabsTransport(config: STTConnectionConfig) {
  const sessionStartMs = Date.now();

  return createWsTransport(
    {
      url: buildElevenLabsUrl(config),
      headers: {
        'xi-api-key': config.auth.kind === 'apiKey' ? config.auth.key : '',
      },
      onReady: () => {
        if (config.keyterms && config.keyterms.length > 0) {
          return [buildKeytermsConfig(config.keyterms)];
        }
        return [];
      },
      parseMessage: createElevenLabsMessageParser(sessionStartMs, shouldIncludeTimestamps(config)),
      label: 'ElevenLabs',
    },
    (chunk) =>
      JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: chunk.samplesB64,
        commit: false,
        sample_rate: chunk.sampleRateHz,
      }),
    () => JSON.stringify({ message_type: 'commit' }),
  );
}

export const elevenlabsAdapter: STTAdapter = {
  providerId: 'elevenlabs',

  async models(): Promise<ModelDescriptor[]> {
    const descriptor = await getModelDescriptor('elevenlabs', 'scribe_v2_realtime');
    return descriptor ? [descriptor] : [];
  },

  async connect(config: STTConnectionConfig): Promise<STTConnection> {
    return createManagedConnection({
      buffer: config.buffer,
      reconnect: config.reconnect,
      partialStrategy: config.partialStrategy,
      classifyError: classifyElevenLabsError,
      openConnection: () => createElevenLabsTransport(config),
    });
  },
};
