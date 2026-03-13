export type FieldDef = {
  key: string
  label: string
  placeholder?: string
  required: boolean
  secret: boolean
}

export type AuthMethodDef = {
  method: string
  label: string
  fields: FieldDef[]
}

export type ProviderMeta = {
  displayName: string
  description?: string
  extraFields: FieldDef[]
  authMethods: AuthMethodDef[]
}

export const PROVIDER_META: Record<string, ProviderMeta> = {
  anthropic: {
    displayName: 'Anthropic',
    description: 'Direct access to Claude models, including Pro and Max',
    extraFields: [],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'sk-ant-...', required: true, secret: true }],
      },
    ],
  },
  openai: {
    displayName: 'OpenAI',
    description: 'Access to GPT-4 and other OpenAI models',
    extraFields: [
      { key: 'organization', label: 'Organization', placeholder: 'org-...', required: false, secret: false },
      { key: 'project', label: 'Project', placeholder: 'proj_...', required: false, secret: false },
    ],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'sk-...', required: true, secret: true }],
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
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'AIza...', required: true, secret: true }],
      },
    ],
  },
  'amazon-bedrock': {
    displayName: 'Amazon Bedrock',
    description: 'Access to foundation models via AWS',
    extraFields: [
      { key: 'region', label: 'Region', placeholder: 'us-east-1', required: false, secret: false },
    ],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'Key', required: true, secret: true }],
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
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'sk-or-...', required: true, secret: true }],
      },
    ],
  },
  vercel: {
    displayName: 'Vercel',
    description: 'Vercel AI SDK provider',
    extraFields: [],
    authMethods: [
      {
        method: 'api-key',
        label: 'API Key',
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'Key', required: true, secret: true }],
      },
    ],
  },
}
