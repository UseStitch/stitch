import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import { createOpenAI } from '@ai-sdk/openai';
import { createVercel } from '@ai-sdk/vercel';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';

export const BedrockCredentialsSchema = z.object({
  providerId: z.literal('amazon-bedrock'),
  region: z.string().optional(),
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

export const AnthropicCredentialsSchema = z.object({
  providerId: z.literal('anthropic'),
  auth: z.discriminatedUnion('method', [
    z.object({ method: z.literal('api-key'), apiKey: z.string() }),
    z.object({ method: z.literal('auth-token'), authToken: z.string() }),
  ]),
});

export const GoogleCredentialsSchema = z.object({
  providerId: z.literal('google'),
  auth: z.object({ method: z.literal('api-key'), apiKey: z.string() }),
});

export const GoogleVertexCredentialsSchema = z.object({
  providerId: z.literal('google-vertex'),
  project: z.string().optional(),
  location: z.string().optional(),
  auth: z.discriminatedUnion('method', [
    z.object({ method: z.literal('api-key'), apiKey: z.string() }),
    z.object({ method: z.literal('adc') }),
    z.object({ method: z.literal('service-account'), googleAuthOptions: z.record(z.string(), z.unknown()) }),
  ]),
});

export const OpenAICredentialsSchema = z.object({
  providerId: z.literal('openai'),
  organization: z.string().optional(),
  project: z.string().optional(),
  auth: z.object({ method: z.literal('api-key'), apiKey: z.string() }),
});

export const OpenRouterCredentialsSchema = z.object({
  providerId: z.literal('openrouter'),
  auth: z.object({ method: z.literal('api-key'), apiKey: z.string() }),
});

export const VercelCredentialsSchema = z.object({
  providerId: z.literal('vercel'),
  auth: z.object({ method: z.literal('api-key'), apiKey: z.string() }),
});

export const ProviderCredentialsSchema = z.discriminatedUnion('providerId', [
  BedrockCredentialsSchema,
  AnthropicCredentialsSchema,
  GoogleCredentialsSchema,
  GoogleVertexCredentialsSchema,
  OpenAICredentialsSchema,
  OpenRouterCredentialsSchema,
  VercelCredentialsSchema,
]);

export type BedrockCredentials = z.infer<typeof BedrockCredentialsSchema>;
export type AnthropicCredentials = z.infer<typeof AnthropicCredentialsSchema>;
export type GoogleCredentials = z.infer<typeof GoogleCredentialsSchema>;
export type GoogleVertexCredentials = z.infer<typeof GoogleVertexCredentialsSchema>;
export type OpenAICredentials = z.infer<typeof OpenAICredentialsSchema>;
export type OpenRouterCredentials = z.infer<typeof OpenRouterCredentialsSchema>;
export type VercelCredentials = z.infer<typeof VercelCredentialsSchema>;
export type ProviderCredentials = z.infer<typeof ProviderCredentialsSchema>;

export const createProvider = (credentials: ProviderCredentials) => {
  switch (credentials.providerId) {
    case 'amazon-bedrock': {
      const base = { region: credentials.region };
      switch (credentials.auth.method) {
        case 'api-key':
          return createAmazonBedrock({ ...base, apiKey: credentials.auth.apiKey });
        case 'iam':
          return createAmazonBedrock({
            ...base,
            accessKeyId: credentials.auth.accessKeyId,
            secretAccessKey: credentials.auth.secretAccessKey,
            sessionToken: credentials.auth.sessionToken,
          });
        case 'credential-provider':
          return createAmazonBedrock({
            ...base,
            credentialProvider: fromNodeProviderChain(),
          });
      }
    }

    case 'anthropic': {
      switch (credentials.auth.method) {
        case 'api-key':
          return createAnthropic({ apiKey: credentials.auth.apiKey });
        case 'auth-token':
          return createAnthropic({ authToken: credentials.auth.authToken });
      }
    }

    case 'google':
      return createGoogleGenerativeAI({ apiKey: credentials.auth.apiKey });

    case 'google-vertex': {
      const base = { project: credentials.project, location: credentials.location };
      switch (credentials.auth.method) {
        case 'api-key':
          return createVertex({ ...base, apiKey: credentials.auth.apiKey });
        case 'adc':
          return createVertex({ ...base });
        case 'service-account':
          return createVertex({
            ...base,
            googleAuthOptions: credentials.auth.googleAuthOptions,
          });
      }
    }

    case 'openai':
      return createOpenAI({
        apiKey: credentials.auth.apiKey,
        organization: credentials.organization,
        project: credentials.project,
      });

    case 'openrouter':
      return createOpenRouter({ apiKey: credentials.auth.apiKey });

    case 'vercel':
      return createVercel({ apiKey: credentials.auth.apiKey });
  }
};
