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
};

type SelectOption = { value: string; label: string };

export type FieldDef =
  | (BaseFieldDef & { type?: 'text' })
  | (BaseFieldDef & { type: 'select'; options: SelectOption[] });

export type AuthMethodDef = {
  method: string;
  label: string;
  enabled: boolean;
  fields: FieldDef[];
};

export type ProviderCapability = 'llm' | 'stt' | 'embedding';

export type ProviderMeta = {
  displayName: string;
  description?: string;
  api?: string;
  capabilities: ProviderCapability[];
  extraFields: FieldDef[];
  authMethods: AuthMethodDef[];
};

export const PROVIDER_IDS = [
  'amazon-bedrock',
  'anthropic',
  'assemblyai',
  'elevenlabs',
  'google',
  'google-vertex',
  'nvidia',
  'ollama_local',
  'openai',
  'openrouter',
  'vercel',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];
