import { z } from 'zod';

export const AWS_BEDROCK_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'eu-west-2', label: 'Europe (London)' },
  { value: 'eu-west-3', label: 'Europe (Paris)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { value: 'eu-central-2', label: 'Europe (Zurich)' },
  { value: 'eu-north-1', label: 'Europe (Stockholm)' },
  { value: 'ap-east-1', label: 'Asia Pacific (Hong Kong)' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
  { value: 'ap-south-2', label: 'Asia Pacific (Hyderabad)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'ap-southeast-3', label: 'Asia Pacific (Jakarta)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { value: 'ap-northeast-3', label: 'Asia Pacific (Osaka)' },
  { value: 'ca-central-1', label: 'Canada (Central)' },
  { value: 'sa-east-1', label: 'South America (São Paulo)' },
  { value: 'me-west-1', label: 'Middle East (UAE)' },
  { value: 'me-central-1', label: 'Middle East (UAE)' },
  { value: 'af-south-1', label: 'Africa (Cape Town)' },
] as const;

type BaseFieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
  secret: boolean;
  format?: 'url';
};

type SelectOption = { value: string; label: string };

export type FieldDef =
  | (BaseFieldDef & { type?: 'text' })
  | (BaseFieldDef & { type: 'select'; options: SelectOption[] });

type AuthMethodDef = { method: string; label: string; enabled: boolean; fields: FieldDef[] };

export type ProviderCapability = 'llm' | 'stt' | 'embedding';

export const PROVIDER_IDS = [
  'amazon-bedrock',
  'anthropic',
  'assemblyai',
  'elevenlabs',
  'google',
  'google-vertex',
  'lmstudio_local',
  'nvidia',
  'ollama_local',
  'openai',
  'openrouter',
  'vercel',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];
const providerIdSchema = z.enum(PROVIDER_IDS);

const PROVIDER_CAPABILITIES = {
  'amazon-bedrock': ['llm'],
  anthropic: ['llm'],
  assemblyai: ['stt'],
  elevenlabs: ['stt'],
  google: ['llm', 'stt', 'embedding'],
  'google-vertex': ['llm'],
  lmstudio_local: ['llm'],
  nvidia: ['llm', 'embedding'],
  ollama_local: ['llm'],
  openai: ['llm', 'stt', 'embedding'],
  openrouter: ['llm', 'embedding'],
  vercel: ['llm'],
} as const satisfies Record<ProviderId, readonly ProviderCapability[]>;

type ProvidersWithCapability<C extends ProviderCapability> = {
  [K in ProviderId]: C extends (typeof PROVIDER_CAPABILITIES)[K][number] ? K : never;
}[ProviderId];

export type LlmProviderId = ProvidersWithCapability<'llm'>;
export type LocalProviderId = 'ollama_local' | 'lmstudio_local';
type SttProviderId = ProvidersWithCapability<'stt'>;
export type EmbeddingProviderId = ProvidersWithCapability<'embedding'>;

function hasProviderCapability(providerId: string, capability: ProviderCapability): providerId is ProviderId {
  const result = providerIdSchema.safeParse(providerId);
  return result.success && PROVIDER_CAPABILITIES[result.data].some((supported) => supported === capability);
}

export function isLlmProviderId(providerId: string): providerId is LlmProviderId {
  return hasProviderCapability(providerId, 'llm');
}

const LOCAL_PROVIDER_IDS = ['ollama_local', 'lmstudio_local'] as const satisfies readonly LocalProviderId[];
const localProviderIdSchema = z.enum(LOCAL_PROVIDER_IDS);

export function isLocalProviderId(providerId: string): providerId is LocalProviderId {
  return localProviderIdSchema.safeParse(providerId).success;
}

function isSttProviderId(providerId: string): providerId is SttProviderId {
  return hasProviderCapability(providerId, 'stt');
}

export function isEmbeddingProviderId(providerId: string): providerId is EmbeddingProviderId {
  return hasProviderCapability(providerId, 'embedding');
}

export type ModelCost = {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
  context_over_200k?: { input: number; output: number; cache_read?: number; cache_write?: number };
};

export type ProviderMeta = {
  displayName: string;
  description?: string;
  api?: string;
  capabilities: ProviderCapability[];
  extraFields: FieldDef[];
  authMethods: AuthMethodDef[];
};

export const LLM_PROVIDER_IDS = PROVIDER_IDS.filter(isLlmProviderId);
export const STT_PROVIDER_IDS = PROVIDER_IDS.filter(isSttProviderId);
export const EMBEDDING_PROVIDER_IDS = PROVIDER_IDS.filter(isEmbeddingProviderId);
