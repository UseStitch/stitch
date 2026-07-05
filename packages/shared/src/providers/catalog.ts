import { AWS_BEDROCK_REGIONS } from './types.js';

import type { ProviderId, ProviderMeta } from './types.js';

export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  assemblyai: {
    displayName: 'AssemblyAI',
    description: 'Real-time speech-to-text with Universal-3 Pro Streaming',
    api: 'https://api.assemblyai.com',
    capabilities: ['stt'],
    extraFields: [],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [
          { key: 'apiKey', label: 'API Key', placeholder: 'your-assemblyai-api-key', required: true, secret: true },
        ],
      },
    ],
  },
  anthropic: {
    displayName: 'Anthropic',
    description: 'Direct access to Claude models, including Pro and Max',
    api: 'https://api.anthropic.com',
    capabilities: ['llm'],
    extraFields: [],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'sk-ant-...', required: true, secret: true }],
      },
      {
        method: 'auth-token',
        label: 'Auth Token',
        enabled: false,
        fields: [{ key: 'authToken', label: 'Auth Token', placeholder: '', required: true, secret: true }],
      },
    ],
  },
  openai: {
    displayName: 'OpenAI',
    description: 'Access to GPT-4 and other OpenAI models',
    api: 'https://api.openai.com',
    capabilities: ['llm', 'stt', 'embedding'],
    extraFields: [
      { key: 'organization', label: 'Organization', placeholder: 'org-...', required: false, secret: false },
      { key: 'project', label: 'Project', placeholder: 'proj_...', required: false, secret: false },
    ],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'sk-...', required: true, secret: true }],
      },
    ],
  },
  elevenlabs: {
    displayName: 'ElevenLabs',
    description: 'Speech-to-text and audio intelligence',
    api: 'https://api.elevenlabs.io',
    capabilities: ['stt'],
    extraFields: [],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'sk_...', required: true, secret: true }],
      },
    ],
  },
  google: {
    displayName: 'Google AI',
    description: 'Access to Gemini and other Google AI models',
    api: 'https://generativelanguage.googleapis.com',
    capabilities: ['llm'],
    extraFields: [],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'AIza...', required: true, secret: true }],
      },
    ],
  },
  'google-vertex': {
    displayName: 'Google Vertex AI',
    description: 'Access to Gemini models via Google Cloud Vertex AI',
    api: 'https://us-central1-aiplatform.googleapis.com',
    capabilities: ['llm'],
    extraFields: [
      { key: 'project', label: 'Project', placeholder: 'my-gcp-project', required: false, secret: false },
      { key: 'location', label: 'Location', placeholder: 'us-central1', required: false, secret: false },
    ],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: false,
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: '', required: true, secret: true }],
      },
      { method: 'adc', label: 'Application Default Credentials', enabled: false, fields: [] },
      { method: 'service-account', label: 'Service Account', enabled: false, fields: [] },
    ],
  },
  'amazon-bedrock': {
    displayName: 'Amazon Bedrock',
    description: 'Access to foundation models via AWS',
    api: 'https://bedrock.us-east-1.amazonaws.com',
    capabilities: ['llm'],
    extraFields: [
      {
        key: 'region',
        label: 'Region',
        placeholder: 'Select a region',
        required: true,
        secret: false,
        type: 'select',
        options: AWS_BEDROCK_REGIONS.map((r) => ({ value: r.value, label: `${r.label} (${r.value})` })),
      },
    ],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'Key', required: true, secret: true }],
      },
      {
        method: 'iam',
        label: 'IAM Credentials',
        enabled: false,
        fields: [
          { key: 'accessKeyId', label: 'Access Key ID', placeholder: 'AKIA...', required: true, secret: false },
          { key: 'secretAccessKey', label: 'Secret Access Key', placeholder: '', required: true, secret: true },
          { key: 'sessionToken', label: 'Session Token', placeholder: '', required: false, secret: true },
        ],
      },
      { method: 'credential-provider', label: 'Credential Provider Chain', enabled: false, fields: [] },
    ],
  },
  nvidia: {
    displayName: 'NVIDIA',
    description: 'Access to NVIDIA NIM and foundation models',
    api: 'https://integrate.api.nvidia.com',
    capabilities: ['llm'],
    extraFields: [],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'nvapi-...', required: true, secret: true }],
      },
    ],
  },
  ollama_local: {
    displayName: 'Ollama',
    description: 'Run models locally with Ollama',
    api: 'http://localhost:11434',
    capabilities: ['llm'],
    extraFields: [
      { key: 'baseURL', label: 'Base URL', placeholder: 'http://localhost:11434', required: false, secret: false },
    ],
    authMethods: [{ method: 'none', label: 'No authentication', enabled: true, fields: [] }],
  },
  openrouter: {
    displayName: 'OpenRouter',
    description: 'Unified API for multiple LLM providers',
    api: 'https://openrouter.ai/api',
    capabilities: ['llm'],
    extraFields: [],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'sk-or-...', required: true, secret: true }],
      },
    ],
  },
  vercel: {
    displayName: 'Vercel',
    description: 'Vercel AI Gateway',
    api: 'https://ai.vercel.com',
    capabilities: ['llm'],
    extraFields: [],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        enabled: true,
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'Key', required: true, secret: true }],
      },
    ],
  },
};
