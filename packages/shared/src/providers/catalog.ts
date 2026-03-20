import type { ProviderId, ProviderMeta } from './types.js';

export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  anthropic: {
    displayName: 'Anthropic',
    description: 'Direct access to Claude models, including Pro and Max',
    extraFields: [],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [
          {
            key: 'apiKey',
            label: 'API Key',
            placeholder: 'sk-ant-...',
            required: true,
            secret: true,
          },
        ],
      },
      {
        method: 'auth-token',
        label: 'Auth Token',
        enabled: false,
        fields: [
          { key: 'authToken', label: 'Auth Token', placeholder: '', required: true, secret: true },
        ],
      },
    ],
  },
  openai: {
    displayName: 'OpenAI',
    description: 'Access to GPT-4 and other OpenAI models',
    extraFields: [
      {
        key: 'organization',
        label: 'Organization',
        placeholder: 'org-...',
        required: false,
        secret: false,
      },
      { key: 'project', label: 'Project', placeholder: 'proj_...', required: false, secret: false },
    ],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [
          { key: 'apiKey', label: 'API Key', placeholder: 'sk-...', required: true, secret: true },
        ],
      },
    ],
  },
  google: {
    displayName: 'Google AI',
    description: 'Access to Gemini and other Google AI models',
    extraFields: [],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [
          { key: 'apiKey', label: 'API Key', placeholder: 'AIza...', required: true, secret: true },
        ],
      },
    ],
  },
  'google-vertex': {
    displayName: 'Google Vertex AI',
    description: 'Access to Gemini models via Google Cloud Vertex AI',
    extraFields: [
      {
        key: 'project',
        label: 'Project',
        placeholder: 'my-gcp-project',
        required: false,
        secret: false,
      },
      {
        key: 'location',
        label: 'Location',
        placeholder: 'us-central1',
        required: false,
        secret: false,
      },
    ],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: false,
        fields: [
          { key: 'apiKey', label: 'API Key', placeholder: '', required: true, secret: true },
        ],
      },
      {
        method: 'adc',
        label: 'Application Default Credentials',
        enabled: false,
        fields: [],
      },
      {
        method: 'service-account',
        label: 'Service Account',
        enabled: false,
        fields: [],
      },
    ],
  },
  'amazon-bedrock': {
    displayName: 'Amazon Bedrock',
    description: 'Access to foundation models via AWS',
    extraFields: [
      {
        key: 'region',
        label: 'Region',
        placeholder: 'Select a region',
        required: true,
        secret: false,
      },
    ],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [
          { key: 'apiKey', label: 'API Key', placeholder: 'Key', required: true, secret: true },
        ],
      },
      {
        method: 'iam',
        label: 'IAM Credentials',
        enabled: false,
        fields: [
          {
            key: 'accessKeyId',
            label: 'Access Key ID',
            placeholder: 'AKIA...',
            required: true,
            secret: false,
          },
          {
            key: 'secretAccessKey',
            label: 'Secret Access Key',
            placeholder: '',
            required: true,
            secret: true,
          },
          {
            key: 'sessionToken',
            label: 'Session Token',
            placeholder: '',
            required: false,
            secret: true,
          },
        ],
      },
      {
        method: 'credential-provider',
        label: 'Credential Provider Chain',
        enabled: false,
        fields: [],
      },
    ],
  },
  openrouter: {
    displayName: 'OpenRouter',
    description: 'Unified API for multiple LLM providers',
    extraFields: [],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [
          {
            key: 'apiKey',
            label: 'API Key',
            placeholder: 'sk-or-...',
            required: true,
            secret: true,
          },
        ],
      },
    ],
  },
  vercel: {
    displayName: 'Vercel',
    description: 'Vercel AI Gateway',
    extraFields: [],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [
          { key: 'apiKey', label: 'API Key', placeholder: 'Key', required: true, secret: true },
        ],
      },
    ],
  },
};
