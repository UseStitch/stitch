import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import { createVertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createGateway } from 'ai';
import { z } from 'zod';

const BedrockCredentialsSchema = z.object({
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
    z.object({
      method: z.literal('service-account'),
      googleAuthOptions: z.record(z.string(), z.unknown()),
    }),
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

export const ProviderCredentialsSchema = z.discriminatedUnion('providerId', [
  BedrockCredentialsSchema,
  AnthropicCredentialsSchema,
  GoogleCredentialsSchema,
  GoogleVertexCredentialsSchema,
  OpenAICredentialsSchema,
  OpenRouterCredentialsSchema,
  VercelCredentialsSchema,
]);

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
      const authOptions = (() => {
        switch (credentials.auth.method) {
          case 'api-key':
            return { apiKey: credentials.auth.apiKey } as const;
          case 'adc':
            return {} as const;
          case 'service-account':
            return { googleAuthOptions: credentials.auth.googleAuthOptions } as const;
        }
      })();

      const vertex = createVertex({ ...base, ...authOptions });
      const anthropic = createVertexAnthropic({ ...base, ...authOptions });

      // Route to the Anthropic SDK for Claude models on Vertex
      return ((modelId: string) => {
        if (modelId.includes('claude') || modelId.includes('anthropic')) {
          return anthropic(modelId);
        }
        return vertex(modelId);
      }) as ReturnType<typeof createVertex>;
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
      return createGateway({ apiKey: credentials.auth.apiKey });
  }
};
