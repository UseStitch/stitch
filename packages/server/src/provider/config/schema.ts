import { z } from 'zod';

import { AWS_BEDROCK_REGIONS, isEmbeddingProviderId, isLlmProviderId } from '@stitch/shared/providers/types';
import type { EmbeddingProviderId, LlmProviderId, ProviderId } from '@stitch/shared/providers/types';

const AWS_REGION_VALUES = AWS_BEDROCK_REGIONS.map((r) => r.value) as [string, ...string[]];

const baseURLSchema = z
  .url()
  .refine((val) => val.startsWith('http://') || val.startsWith('https://'), {
    message: 'URL must use http or https protocol',
  })
  .transform((val) => val.replace(/\/+$/, ''));

const BedrockCredentialsSchema = z.object({
  providerId: z.literal('amazon-bedrock'),
  region: z.enum(AWS_REGION_VALUES),
  auth: z.discriminatedUnion('method', [
    z.object({ method: z.literal('api-key'), apiKey: z.string() }),
    z.object({
      method: z.literal('iam'),
      accessKeyId: z.string(),
      secretAccessKey: z.string(),
      sessionToken: z.string().optional(),
    }),
    z.object({ method: z.literal('credential-provider') }),
  ]),
});

const AnthropicCredentialsSchema = z.object({
  providerId: z.literal('anthropic'),
  auth: z.discriminatedUnion('method', [
    z.object({ method: z.literal('api-key'), apiKey: z.string() }),
    z.object({ method: z.literal('auth-token'), authToken: z.string() }),
  ]),
});

const GoogleVertexCredentialsSchema = z.object({
  providerId: z.literal('google-vertex'),
  project: z.string().optional(),
  location: z.string().optional(),
  auth: z.discriminatedUnion('method', [
    z.object({ method: z.literal('api-key'), apiKey: z.string() }),
    z.object({ method: z.literal('adc') }),
    z.object({ method: z.literal('service-account'), googleAuthOptions: z.record(z.string(), z.unknown()) }),
  ]),
});

const OpenAICredentialsSchema = z.object({
  providerId: z.literal('openai'),
  organization: z.string().optional(),
  project: z.string().optional(),
  auth: z.object({ method: z.literal('api-key'), apiKey: z.string() }),
});

const OllamaCredentialsSchema = z.object({
  providerId: z.literal('ollama_local'),
  baseURL: baseURLSchema,
  auth: z.object({ method: z.literal('none') }),
});

const LmStudioCredentialsSchema = z.object({
  providerId: z.literal('lmstudio_local'),
  baseURL: baseURLSchema,
  auth: z.object({ method: z.literal('none') }),
});

const apiKeyAuthSchema = z.object({ method: z.literal('api-key'), apiKey: z.string() });

const API_KEY_ONLY_PROVIDERS = ['google', 'openrouter', 'vercel', 'nvidia', 'elevenlabs', 'assemblyai'] as const;

type ApiKeyProviderSchemas = [
  z.ZodObject<{ providerId: z.ZodLiteral<'google'>; auth: typeof apiKeyAuthSchema }>,
  z.ZodObject<{ providerId: z.ZodLiteral<'openrouter'>; auth: typeof apiKeyAuthSchema }>,
  z.ZodObject<{ providerId: z.ZodLiteral<'vercel'>; auth: typeof apiKeyAuthSchema }>,
  z.ZodObject<{ providerId: z.ZodLiteral<'nvidia'>; auth: typeof apiKeyAuthSchema }>,
  z.ZodObject<{ providerId: z.ZodLiteral<'elevenlabs'>; auth: typeof apiKeyAuthSchema }>,
  z.ZodObject<{ providerId: z.ZodLiteral<'assemblyai'>; auth: typeof apiKeyAuthSchema }>,
];

const apiKeyProviderSchemas = API_KEY_ONLY_PROVIDERS.map((id) =>
  z.object({ providerId: z.literal(id), auth: apiKeyAuthSchema }),
) as unknown as ApiKeyProviderSchemas;

export const ProviderCredentialsSchema = z.discriminatedUnion('providerId', [
  BedrockCredentialsSchema,
  AnthropicCredentialsSchema,
  GoogleVertexCredentialsSchema,
  OpenAICredentialsSchema,
  LmStudioCredentialsSchema,
  OllamaCredentialsSchema,
  ...apiKeyProviderSchemas,
]);

export type ProviderCredentials = z.infer<typeof ProviderCredentialsSchema>;
export type LlmProviderCredentials = Extract<ProviderCredentials, { providerId: LlmProviderId }>;
/** @knipignore Reserved for embedding consumers. */
export type EmbeddingProviderCredentials = Extract<ProviderCredentials, { providerId: EmbeddingProviderId }>;
export type ModelProviderCredentials = Extract<
  ProviderCredentials,
  { providerId: LlmProviderId | EmbeddingProviderId }
>;

export function isLlmProviderCredentials(credentials: ProviderCredentials): credentials is LlmProviderCredentials {
  return isLlmProviderId(credentials.providerId);
}

/** @knipignore Reserved for embedding consumers. */
export function isEmbeddingProviderCredentials(
  credentials: ProviderCredentials,
): credentials is EmbeddingProviderCredentials {
  return isEmbeddingProviderId(credentials.providerId);
}

// Compile-time guard: every ProviderId must have a credentials schema entry and vice versa.
// If you add a new ID to PROVIDER_IDS without a schema, or a schema without an ID, this fails.
type _CredentialsCoversAllProviders = [ProviderCredentials['providerId']] extends [ProviderId]
  ? [ProviderId] extends [ProviderCredentials['providerId']]
    ? true
    : 'ERROR: PROVIDER_IDS has members missing from ProviderCredentialsSchema'
  : 'ERROR: ProviderCredentialsSchema has members missing from PROVIDER_IDS';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertCredentialsDrift: _CredentialsCoversAllProviders = true;
