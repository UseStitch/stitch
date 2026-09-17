import { z } from 'zod';

export type STTCapability =
  | 'partials'
  | 'word_timestamps'
  | 'utterance_timestamps'
  | 'diarization'
  | 'native_vad'
  | 'language_detection'
  | 'keyterm_biasing';

export type CapabilitySupport = 'native' | 'fallback' | 'unsupported';

export type ModelCapabilities = Record<STTCapability, boolean>;

export type CapabilityRequest = Partial<Record<STTCapability, 'required' | 'preferred'>>;

export type CapabilityResolution = { satisfied: Record<STTCapability, CapabilitySupport>; degraded: STTCapability[] };

const AudioEncodingSchema = z.enum(['f32le', 'pcm_s16le']);
type AudioEncoding = z.infer<typeof AudioEncodingSchema>;

export type AudioFormat = { encoding: AudioEncoding; sampleRateHz: number; channels: number };

export type AudioChunk = { samplesB64: string; sampleRateHz: number; numSamples: number; encoding: AudioEncoding };

const AudioSourceSchema = z.enum(['mic', 'speaker']);
export type AudioSource = z.infer<typeof AudioSourceSchema>;

type TranscriptWord = { text: string; startMs: number; endMs: number; speaker?: string | number };

export type TranscriptEvent = {
  id: string;
  kind: 'partial' | 'final';
  text: string;
  offsetMs: number;
  speaker?: string | number;
  words?: TranscriptWord[];
  language?: string;
};

export type STTUsage = { durationMs: number; audioInputTokens?: number; textOutputTokens?: number };

// WebSocket protocol messages (client -> server)
const SttServiceSchema = z.enum(['chat-input', 'meeting-recording']);

export const SttStartMessageSchema = z.object({
  type: z.literal('start'),
  sttSessionId: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  service: SttServiceSchema,
  recordingId: z.string().optional(),
  capabilityRequest: z
    .record(z.string(), z.enum(['required', 'preferred']))
    .optional()
    .default({}),
  language: z.string().optional(),
  keyterms: z.array(z.string()).optional(),
  audioChunkConfig: z.object({ encoding: AudioEncodingSchema, sampleRateHz: z.number().int().positive() }),
});

const SttChunkMessageSchema = z.object({
  type: z.literal('chunk'),
  sttSessionId: z.string().min(1),
  source: AudioSourceSchema,
  samplesB64: z.string(),
  sampleRateHz: z.number().int().positive(),
  numSamples: z.number().int().nonnegative(),
});

const SttCommitMessageSchema = z.object({ type: z.literal('commit'), sttSessionId: z.string().min(1) });

const SttStopMessageSchema = z.object({ type: z.literal('stop'), sttSessionId: z.string().min(1) });

export const SttInboundMessageSchema = z.discriminatedUnion('type', [
  SttStartMessageSchema,
  SttChunkMessageSchema,
  SttCommitMessageSchema,
  SttStopMessageSchema,
]);

export type SttInboundMessage = z.infer<typeof SttInboundMessageSchema>;

export const SttAudioFrameHeaderSchema = z.object({
  sttSessionId: z.string().min(1),
  source: AudioSourceSchema,
  sampleRateHz: z.number().int().positive(),
  numSamples: z.number().int().nonnegative(),
  encoding: AudioEncodingSchema,
});

// WebSocket protocol messages (server -> client)
type SttReadyMessage = { type: 'ready'; sttSessionId: string; capabilityResolution: CapabilityResolution };

type SttTranscriptMessage = {
  type: 'transcript';
  sttSessionId: string;
  id: string;
  kind: 'partial' | 'final';
  text: string;
  offsetMs: number;
  speaker?: string | number;
  words?: TranscriptWord[];
  language?: string;
};

type SttErrorMessage = { type: 'error'; sttSessionId: string; message: string; code: string };

type SttDoneMessage = { type: 'done'; sttSessionId: string; costUsd: number; usage: STTUsage };

type SttUnrecoverableMessage = { type: 'unrecoverable'; sttSessionId: string; reason: string };

export type SttOutboundMessage =
  | SttReadyMessage
  | SttTranscriptMessage
  | SttErrorMessage
  | SttDoneMessage
  | SttUnrecoverableMessage;

type SttModelSummary = { id: string; name: string; sampleRateHz: number };

export type SttProviderModels = { providerId: string; providerName: string; models: SttModelSummary[] };

export const BufferConfigSchema = z.object({
  maxChunkBytes: z.number().int().positive(),
  flushIntervalMs: z.number().int().positive(),
  maxBufferedMs: z.number().int().positive(),
});
export type BufferConfig = z.infer<typeof BufferConfigSchema>;

export const ReconnectConfigSchema = z.object({
  enabled: z.boolean(),
  maxRetries: z.number().int().nonnegative(),
  backoffMs: z.number().int().nonnegative(),
  maxBackoffMs: z.number().int().positive().optional(),
  rotateBeforeMs: z.number().int().positive().optional(),
  pingIntervalMs: z.number().int().positive().optional(),
  pongTimeoutMs: z.number().int().positive().optional(),
  keepAliveMessage: z.string().min(1).optional(),
});
export type ReconnectConfig = z.infer<typeof ReconnectConfigSchema>;
