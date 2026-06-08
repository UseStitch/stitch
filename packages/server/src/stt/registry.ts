import type { STTAdapter } from '@/stt/adapter-iface.js';
import type { ModelDescriptor } from '@/stt/types.js';

const adapters = new Map<string, STTAdapter>();

export function registerAdapter(adapter: STTAdapter): void {
  adapters.set(adapter.providerId, adapter);
}

export function getAdapter(providerId: string): STTAdapter | null {
  return adapters.get(providerId) ?? null;
}

// ─── Model Catalog ─────────────────────────────────────────────────────────────

type CatalogEntry = {
  providerId: string;
  models: ModelDescriptor[];
};

const MODEL_CATALOG: CatalogEntry[] = [
  {
    providerId: 'openai',
    models: [
      {
        modelId: 'gpt-4o-transcribe',
        displayName: 'GPT-4o Transcribe',
        capabilities: {
          partials: true,
          word_timestamps: false,
          utterance_timestamps: false,
          diarization: false,
          native_vad: true,
          language_detection: true,
          keyterm_biasing: false,
        },
        inputFormat: { encoding: 'pcm_s16le', sampleRateHz: 24000, channels: 1 },
        buffer: {
          maxChunkBytes: 65_536,
          flushIntervalMs: 100,
          maxBufferedMs: 30_000,
          paceRealtime: false,
        },
        reconnect: { enabled: true, maxRetries: 5, backoffMs: 500, rotateBeforeMs: 29 * 60 * 1000 },
        pricing: { type: 'token', perMillionTokens: { audioInput: 40, textOutput: 10 } },
      },
      {
        modelId: 'gpt-4o-mini-transcribe',
        displayName: 'GPT-4o Mini Transcribe',
        capabilities: {
          partials: true,
          word_timestamps: false,
          utterance_timestamps: false,
          diarization: false,
          native_vad: true,
          language_detection: true,
          keyterm_biasing: false,
        },
        inputFormat: { encoding: 'pcm_s16le', sampleRateHz: 24000, channels: 1 },
        buffer: {
          maxChunkBytes: 65_536,
          flushIntervalMs: 100,
          maxBufferedMs: 30_000,
          paceRealtime: false,
        },
        reconnect: { enabled: true, maxRetries: 5, backoffMs: 500, rotateBeforeMs: 29 * 60 * 1000 },
        pricing: { type: 'token', perMillionTokens: { audioInput: 40, textOutput: 10 } },
      },
    ],
  },
  {
    providerId: 'elevenlabs',
    models: [
      {
        modelId: 'scribe_v2_realtime',
        displayName: 'Scribe v2 Realtime',
        capabilities: {
          partials: true,
          word_timestamps: true,
          utterance_timestamps: true,
          diarization: false,
          native_vad: true,
          language_detection: true,
          keyterm_biasing: true,
        },
        inputFormat: { encoding: 'pcm_s16le', sampleRateHz: 16000, channels: 1 },
        buffer: {
          maxChunkBytes: 32_768,
          flushIntervalMs: 80,
          maxBufferedMs: 20_000,
          paceRealtime: false,
        },
        reconnect: { enabled: true, maxRetries: 5, backoffMs: 500 },
        pricing: { type: 'duration', perMinuteUsd: 0.007 },
      },
    ],
  },
  {
    providerId: 'google',
    models: [
      {
        modelId: 'chirp_3',
        displayName: 'Chirp 3 (STT v2)',
        capabilities: {
          partials: true,
          word_timestamps: true,
          utterance_timestamps: true,
          diarization: false,
          native_vad: true,
          language_detection: true,
          keyterm_biasing: false,
        },
        inputFormat: { encoding: 'pcm_s16le', sampleRateHz: 16000, channels: 1 },
        buffer: {
          maxChunkBytes: 25_000,
          flushIntervalMs: 60,
          maxBufferedMs: 15_000,
          paceRealtime: false,
        },
        reconnect: { enabled: true, maxRetries: 5, backoffMs: 1000, rotateBeforeMs: 4 * 60 * 1000 },
        pricing: { type: 'duration', perMinuteUsd: 0.016 },
      },
    ],
  },
];

export function getModelDescriptor(providerId: string, modelId: string): ModelDescriptor | null {
  const entry = MODEL_CATALOG.find((e) => e.providerId === providerId);
  if (!entry) return null;
  return entry.models.find((m) => m.modelId === modelId) ?? null;
}
