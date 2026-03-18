export type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
  secret: boolean;
};

export type AuthMethodDef = {
  method: string;
  label: string;
  enabled: boolean;
  fields: FieldDef[];
};

export type ProviderMeta = {
  displayName: string;
  description?: string;
  extraFields: FieldDef[];
  authMethods: AuthMethodDef[];
};

export const PROVIDER_IDS = [
  'amazon-bedrock',
  'anthropic',
  'google',
  'google-vertex',
  'openai',
  'openrouter',
  'vercel',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];
