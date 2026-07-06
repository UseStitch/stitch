import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import { createVertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createGateway } from 'ai';

import type { ModelProviderCredentials } from '@/provider/config/schema.js';

export { type ProviderCredentials } from '@/provider/config/schema.js';

export const createProvider = (credentials: ModelProviderCredentials) => {
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
          return createAmazonBedrock({ ...base, credentialProvider: fromNodeProviderChain() });
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

    case 'nvidia':
      return createOpenAICompatible({
        name: 'nvidia',
        baseURL: 'https://integrate.api.nvidia.com/v1',
        apiKey: credentials.auth.apiKey,
      });

    case 'openrouter':
      return createOpenRouter({ apiKey: credentials.auth.apiKey });

    case 'vercel':
      return createGateway({ apiKey: credentials.auth.apiKey });

    case 'ollama_local':
      return createOpenAICompatible({
        name: 'ollama_local',
        baseURL: (credentials.baseURL ?? 'http://localhost:11434') + '/v1',
      });
  }
};
