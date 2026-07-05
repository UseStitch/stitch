import { z } from 'zod';

import { AWS_BEDROCK_REGIONS } from '@stitch/shared/providers/types';
import type { ProviderId } from '@stitch/shared/providers/types';

const AWS_REGION_VALUES = AWS_BEDROCK_REGIONS.map((r) => r.value) as [string, ...string[]];

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

const GoogleCredentialsSchema = z.object({
  providerId: z.literal('google'),
  auth: z.object({ method: z.literal('api-key'), apiKey: z.string() }),
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

const OpenRouterCredentialsSchema = z.object({
  providerId: z.literal('openrouter'),
  auth: z.object({ method: z.literal('api-key'), apiKey: z.string() }),
});

const VercelCredentialsSchema = z.object({
  providerId: z.literal('vercel'),
  auth: z.object({ method: z.literal('api-key'), apiKey: z.string() }),
});

const NvidiaCredentialsSchema = z.object({
  providerId: z.literal('nvidia'),
  auth: z.object({ method: z.literal('api-key'), apiKey: z.string() }),
});

const ElevenLabsCredentialsSchema = z.object({
  providerId: z.literal('elevenlabs'),
  auth: z.object({ method: z.literal('api-key'), apiKey: z.string() }),
});

const OllamaCredentialsSchema = z.object({
  providerId: z.literal('ollama_local'),
  baseURL: z.string().optional(),
  auth: z.object({ method: z.literal('none') }),
});

const AssemblyAICredentialsSchema = z.object({
  providerId: z.literal('assemblyai'),
  auth: z.object({ method: z.literal('api-key'), apiKey: z.string() }),
});

export const ProviderCredentialsSchema = z.discriminatedUnion('providerId', [
  AssemblyAICredentialsSchema,
  BedrockCredentialsSchema,
  AnthropicCredentialsSchema,
  ElevenLabsCredentialsSchema,
  GoogleCredentialsSchema,
  GoogleVertexCredentialsSchema,
  NvidiaCredentialsSchema,
  OpenAICredentialsSchema,
  OpenRouterCredentialsSchema,
  VercelCredentialsSchema,
  OllamaCredentialsSchema,
]);

export type ProviderCredentials = z.infer<typeof ProviderCredentialsSchema>;

// Compile-time guard: every ProviderId must have a credentials schema entry and vice versa.
// If you add a new ID to PROVIDER_IDS without a schema, or a schema without an ID, this fails.
type _CredentialsCoversAllProviders = [ProviderCredentials['providerId']] extends [ProviderId]
  ? [ProviderId] extends [ProviderCredentials['providerId']]
    ? true
    : 'ERROR: PROVIDER_IDS has members missing from ProviderCredentialsSchema'
  : 'ERROR: ProviderCredentialsSchema has members missing from PROVIDER_IDS';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertCredentialsDrift: _CredentialsCoversAllProviders = true;
