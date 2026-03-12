import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import { createOpenAI } from '@ai-sdk/openai';
import { createVercel } from '@ai-sdk/vercel';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { GoogleAuthOptions } from 'google-auth-library';

// --- Per-provider credential types ---

export type BedrockCredentials = {
  providerId: 'amazon-bedrock';
  region?: string;
  auth:
    | { method: 'api-key'; apiKey: string }
    | {
        method: 'iam';
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
      }
    | {
        method: 'credential-provider';
        credentialProvider: () => PromiseLike<{
          accessKeyId: string;
          secretAccessKey: string;
          sessionToken?: string;
        }>;
      };
};

export type AnthropicCredentials = {
  providerId: 'anthropic';
  auth: { method: 'api-key'; apiKey: string } | { method: 'auth-token'; authToken: string };
};

export type GoogleCredentials = {
  providerId: 'google';
  auth: { method: 'api-key'; apiKey: string };
};

export type GoogleVertexCredentials = {
  providerId: 'google-vertex';
  project?: string;
  location?: string;
  auth:
    | { method: 'api-key'; apiKey: string }
    | { method: 'adc' }
    | { method: 'service-account'; googleAuthOptions: GoogleAuthOptions };
};

export type OpenAICredentials = {
  providerId: 'openai';
  organization?: string;
  project?: string;
  auth: { method: 'api-key'; apiKey: string };
};

export type OpenRouterCredentials = {
  providerId: 'openrouter';
  auth: { method: 'api-key'; apiKey: string };
};

export type VercelCredentials = {
  providerId: 'vercel';
  auth: { method: 'api-key'; apiKey: string };
};

export type ProviderCredentials =
  | BedrockCredentials
  | AnthropicCredentials
  | GoogleCredentials
  | GoogleVertexCredentials
  | OpenAICredentials
  | OpenRouterCredentials
  | VercelCredentials;

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
            credentialProvider: credentials.auth.credentialProvider,
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
