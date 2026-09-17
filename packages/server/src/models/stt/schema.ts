import z from 'zod';

import { BufferConfigSchema, ReconnectConfigSchema } from '@stitch/shared/stt/types';

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

const TokenPricingSchema = z.object({
  type: z.literal('token'),
  perMillionTokens: z.object({ audioInput: z.number().nonnegative(), textOutput: z.number().nonnegative() }),
});

const DurationPricingSchema = z.object({ type: z.literal('duration'), perMinuteUsd: z.number().nonnegative() });

const PricingSchema = z.discriminatedUnion('type', [TokenPricingSchema, DurationPricingSchema]);

const PartialStrategySchema = z.enum(['cumulative', 'incremental']);

const SttModelSchema = z.object({
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

const SttProviderSchema = z.object({
  $schema: z.string().optional(),
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  models: z.array(SttModelSchema).min(1),
});

export const SttRegistryPayloadSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.iso.datetime({ offset: true }),
  providers: z.array(SttProviderSchema).min(1),
});

export type SttProvider = z.infer<typeof SttProviderSchema>;
export type SttRegistryPayload = z.infer<typeof SttRegistryPayloadSchema>;
