import z from 'zod';

const transcriptionProviderIdSchema = z.enum(['google', 'openai']);

const TranscriptionModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  endpoint: z.string().min(1),
  supportedLanguages: z.array(z.string()).optional(),
  audio: z.object({
    sampleRate: z.number().int().positive(),
    channels: z.number().int().positive(),
    encoding: z.string().min(1),
  }),
  connection: z.object({
    mode: z.string().min(1),
    authMethod: z.string().min(1),
    authParam: z.string().min(1),
  }),
  features: z
    .object({
      voiceActivityDetection: z.boolean().optional(),
      partialResults: z.boolean().optional(),
      delayLevels: z.array(z.string()).optional(),
    })
    .optional(),
  limits: z
    .object({
      maxSessionDurationMs: z.number().int().positive().optional(),
      maxChunkDurationMs: z.number().int().positive().optional(),
    })
    .optional(),
});

export const TranscriptionProviderSchema = z.object({
  $schema: z.string().optional(),
  providerId: transcriptionProviderIdSchema,
  providerName: z.string().min(1),
  models: z.array(TranscriptionModelSchema).min(1),
});

export const TranscriptionRegistryPayloadSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.string().datetime({ offset: true }),
  providers: z.array(TranscriptionProviderSchema).min(1),
});

export type TranscriptionProvider = z.infer<typeof TranscriptionProviderSchema>;
export type TranscriptionRegistryPayload = z.infer<typeof TranscriptionRegistryPayloadSchema>;
