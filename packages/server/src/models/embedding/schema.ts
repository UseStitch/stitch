import z from 'zod';

const embeddingProviderIdSchema = z.enum(['google', 'openai']);

export const EmbeddingModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  family: z.string().optional(),
  dimensions: z.number().int().positive(),
  release_date: z.string().min(1),
  context: z.number().int().positive(),
  inputModalities: z
    .array(z.enum(['text', 'image', 'video', 'audio', 'pdf']))
    .min(1)
    .optional(),
  outputModalities: z
    .array(z.enum(['text']))
    .min(1)
    .optional(),
  cost: z.object({
    input: z.number(),
    inputImage: z.number().optional(),
    inputAudio: z.number().optional(),
    inputVideo: z.number().optional(),
    output: z.number(),
  }),
});

export const EmbeddingProviderSchema = z.object({
  $schema: z.string().optional(),
  providerId: embeddingProviderIdSchema,
  providerName: z.string().min(1),
  api: z.string().optional(),
  npm: z.string().optional(),
  env: z.array(z.string().min(1)).optional(),
  models: z.array(EmbeddingModelSchema).min(1),
});

export const EmbeddingRegistryPayloadSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.string().datetime({ offset: true }),
  providers: z.array(EmbeddingProviderSchema).min(1),
});

export type EmbeddingProvider = z.infer<typeof EmbeddingProviderSchema>;
export type EmbeddingModel = z.infer<typeof EmbeddingModelSchema>;
export type EmbeddingRegistryPayload = z.infer<typeof EmbeddingRegistryPayloadSchema>;
