import type { TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import { getModelDescriptor } from '@/models/stt/service.js';
import type { STTAdapter, STTConnection } from '@/stt/adapter-iface.js';
import { createManagedConnection, type STTErrorClassification } from '@/stt/base-adapter.js';
import type { ModelDescriptor, STTConnectionConfig } from '@/stt/types.js';
import { createWsTransport, type WsMessageResult } from '@/stt/ws-transport.js';

const log = Log.create({ service: 'stt.google' });

const GEMINI_LIVE_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const CREDENTIALS_ERROR_REASON = 'Invalid transcription API credentials. Please check your settings.';
const QUOTA_ERROR_REASON = 'Transcription quota exceeded. Please check your billing.';
const MODEL_ERROR_REASON = 'Selected transcription model is unavailable. Please check your settings.';

type ModalityTokenCount = { modality: string; tokenCount: number };

type GeminiLiveMessage = {
  setupComplete?: Record<string, never>;
  serverContent?: {
    interimInputTranscription?: { text: string };
    inputTranscription?: { text: string };
  };
  usageMetadata?: {
    promptTokenCount?: number;
    responseTokenCount?: number;
    promptTokensDetails?: ModalityTokenCount[];
    responseTokensDetails?: ModalityTokenCount[];
  };
  error?: { code?: number; message: string; status?: string };
};

function tokensForModality(details: ModalityTokenCount[] | undefined, modality: string): number | undefined {
  const matching = details?.filter((detail) => detail.modality === modality);
  if (!matching || matching.length === 0) return undefined;
  return matching.reduce((total, detail) => total + detail.tokenCount, 0);
}

function parseUsage(message: GeminiLiveMessage, durationMs: number): STTUsage | undefined {
  const metadata = message.usageMetadata;
  if (!metadata) return undefined;

  return {
    durationMs,
    audioInputTokens: tokensForModality(metadata.promptTokensDetails, 'AUDIO') ?? metadata.promptTokenCount,
    textOutputTokens: tokensForModality(metadata.responseTokensDetails, 'TEXT') ?? metadata.responseTokenCount,
  };
}

export function createGoogleMessageParser(sessionStartMs: number) {
  let segmentId = 0;

  return function parseMessage(data: string): WsMessageResult | null {
    const message = JSON.parse(data) as GeminiLiveMessage;
    const durationMs = Date.now() - sessionStartMs;
    const usage = parseUsage(message, durationMs);

    if (message.error) {
      log.error({ error: message.error }, 'Google Gemini STT error message');
      const error = new Error(`Google Gemini STT: ${message.error.message}`);
      (error as Error & { code?: string }).code = message.error.status ?? String(message.error.code ?? '');
      return { error, usage };
    }

    const content = message.serverContent;
    if (content?.interimInputTranscription?.text) {
      const transcript: TranscriptEvent = {
        id: `google-segment-${segmentId}`,
        kind: 'partial',
        text: content.interimInputTranscription.text,
        offsetMs: durationMs,
      };
      return { transcript, usage };
    }

    if (content?.inputTranscription) {
      const transcript: TranscriptEvent = {
        id: `google-segment-${segmentId++}`,
        kind: 'final',
        text: content.inputTranscription.text,
        offsetMs: durationMs,
      };
      return { transcript, usage };
    }

    return usage ? { usage } : null;
  };
}

function buildSetupMessage(config: STTConnectionConfig): string {
  const inputAudioTranscription: { languageCodes: string[]; customVocabulary?: string[] } = {
    languageCodes: config.language ? [config.language] : [],
  };
  if (config.keyterms && config.keyterms.length > 0) {
    inputAudioTranscription.customVocabulary = config.keyterms;
  }

  return JSON.stringify({
    setup: {
      model: `models/${config.modelId}`,
      generationConfig: { responseModalities: ['TEXT'] },
      inputAudioTranscription,
    },
  });
}

function isSetupComplete(data: string): boolean {
  return 'setupComplete' in (JSON.parse(data) as GeminiLiveMessage);
}

function classifyGoogleError(err: Error): STTErrorClassification {
  const message = err.message.toLowerCase();
  const code = (err as Error & { code?: string }).code ?? '';

  if (code === 'UNAUTHENTICATED' || code === 'PERMISSION_DENIED' || message.includes('401') || message.includes('403')) {
    return { fatal: true, reason: CREDENTIALS_ERROR_REASON };
  }
  if (code === 'RESOURCE_EXHAUSTED' || message.includes('429') || message.includes('quota')) {
    return { fatal: true, reason: QUOTA_ERROR_REASON };
  }
  if (code === 'NOT_FOUND' || message.includes('404') || message.includes('model not found')) {
    return { fatal: true, reason: MODEL_ERROR_REASON };
  }
  return { fatal: false };
}

function createGoogleTransport(config: STTConnectionConfig) {
  const apiKey = config.auth.kind === 'apiKey' ? config.auth.key : '';
  return createWsTransport(
    {
      url: `${GEMINI_LIVE_URL}?key=${encodeURIComponent(apiKey)}`,
      headers: {},
      onReady: () => [buildSetupMessage(config)],
      parseMessage: createGoogleMessageParser(config.captureStartMs),
      isReadyMessage: isSetupComplete,
      label: 'Google Gemini',
      pingIntervalMs: config.reconnect.pingIntervalMs,
      pongTimeoutMs: config.reconnect.pongTimeoutMs,
      keepAliveMessage: config.reconnect.keepAliveMessage,
    },
    (chunk) =>
      JSON.stringify({
        realtimeInput: {
          audio: { data: chunk.samplesB64, mimeType: `audio/pcm;rate=${chunk.sampleRateHz}` },
        },
      }),
    () => JSON.stringify({ realtimeInput: { audioStreamEnd: true } }),
  );
}

export const googleAdapter: STTAdapter = {
  providerId: 'google',

  async models(): Promise<ModelDescriptor[]> {
    const descriptor = await getModelDescriptor('google', 'gemini-3.5-transcribe-live');
    return descriptor ? [descriptor] : [];
  },

  async connect(config: STTConnectionConfig): Promise<STTConnection> {
    return createManagedConnection({
      buffer: config.buffer,
      reconnect: config.reconnect,
      partialStrategy: config.partialStrategy,
      classifyError: classifyGoogleError,
      openConnection: () => createGoogleTransport(config),
    });
  },
};
