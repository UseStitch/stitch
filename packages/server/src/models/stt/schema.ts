import z from 'zod';

const SttCapabilitySchema = z.enum([
  'partials',
  'word_timestamps',
  'utterance_timestamps',
  'diarization',
  'native_vad',
  'language_detection',
  'keyterm_biasing',
]);

const AudioEncodingSchema = z.enum(['pcm_s16le', 'f32le']);

const InputFormatSchema = z.object({
  encoding: AudioEncodingSchema,
  sampleRateHz: z.number().int().min(8000),
  channels: z.number().int().positive(),
});

const BufferConfigSchema = z.object({
  maxChunkBytes: z.number().int().positive(),
  flushIntervalMs: z.number().int().positive(),
  maxBufferedMs: z.number().int().positive(),
  paceRealtime: z.boolean(),
});

const ReconnectConfigSchema = z.object({
  enabled: z.boolean(),
  maxRetries: z.number().int().nonnegative(),
  backoffMs: z.number().int().nonnegative(),
  maxBackoffMs: z.number().int().positive().optional(),
  rotateBeforeMs: z.number().int().positive().optional(),
});

const TokenPricingSchema = z.object({
  type: z.literal('token'),
  perMillionTokens: z.object({
    audioInput: z.number().nonnegative(),
    textOutput: z.number().nonnegative(),
  }),
});

const DurationPricingSchema = z.object({
  type: z.literal('duration'),
  perMinuteUsd: z.number().nonnegative(),
});

const PricingSchema = z.discriminatedUnion('type', [TokenPricingSchema, DurationPricingSchema]);

const PartialStrategySchema = z.enum(['cumulative', 'incremental']);

export const SttModelSchema = z.object({
  modelId: z.string().min(1),
  displayName: z.string().min(1),
  deprecated: z.boolean(),
  capabilities: z.record(SttCapabilitySchema, z.boolean()),
  inputFormat: InputFormatSchema,
  partialStrategy: PartialStrategySchema,
  buffer: BufferConfigSchema,
  reconnect: ReconnectConfigSchema,
  pricing: PricingSchema,
});

export const SttProviderSchema = z.object({
  $schema: z.string().optional(),
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  models: z.array(SttModelSchema).min(1),
});

export const SttRegistryPayloadSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.string().datetime({ offset: true }),
  providers: z.array(SttProviderSchema).min(1),
});

export type SttModel = z.infer<typeof SttModelSchema>;
export type SttProvider = z.infer<typeof SttProviderSchema>;
export type SttRegistryPayload = z.infer<typeof SttRegistryPayloadSchema>;
