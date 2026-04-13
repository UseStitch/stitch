import type {
  McpAuthConfig,
  McpAuthType,
  McpRegistryServer,
  McpServer,
  McpTransport,
} from '@stitch/shared/mcp/types';

export const AUTH_TYPE_LABELS: Record<McpAuthType, { label: string; description: string }> = {
  none: { label: 'No auth', description: 'Open server, no credentials needed' },
  api_key: { label: 'API key', description: 'Bearer token sent as Authorization header' },
  headers: { label: 'Custom headers', description: 'Arbitrary static headers (e.g. X-API-Token)' },
};

export type HeaderEntry = { key: string; value: string };

export type AddFormState = {
  name: string;
  url: string;
  transport: McpTransport;
  authType: McpAuthType;
  apiKey: string;
  headers: HeaderEntry[];
};

export type HomeTab = 'configured' | 'marketplace';

export type View =
  | { type: 'home'; tab: HomeTab }
  | { type: 'add-custom'; returnTab: HomeTab }
  | { type: 'preview'; server: McpServer; returnTab: HomeTab }
  | { type: 'install'; server: McpRegistryServer; returnTab: HomeTab };

export function buildAuthConfig(form: AddFormState): McpAuthConfig {
  if (form.authType === 'api_key') {
    return { type: 'api_key', apiKey: form.apiKey };
  }
  if (form.authType === 'headers') {
    const headers: Record<string, string> = {};
    for (const { key, value } of form.headers) {
      if (key.trim()) headers[key.trim()] = value;
    }
    return { type: 'headers', headers };
  }
  return { type: 'none' };
}

export function applyAuthConfigToForm(form: AddFormState, authConfig: McpAuthConfig): AddFormState {
  if (authConfig.type === 'api_key') {
    return {
      ...form,
      authType: 'api_key',
      apiKey: authConfig.apiKey,
      headers: [],
    };
  }

  if (authConfig.type === 'headers') {
    return {
      ...form,
      authType: 'headers',
      apiKey: '',
      headers: Object.entries(authConfig.headers).map(([key, value]) => ({ key, value })),
    };
  }

  return {
    ...form,
    authType: 'none',
    apiKey: '',
    headers: [],
  };
}

export function describeAuthConfig(authConfig: McpAuthConfig): string {
  return AUTH_TYPE_LABELS[authConfig.type].label;
}
