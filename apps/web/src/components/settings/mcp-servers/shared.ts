import { z } from 'zod';

import type { McpAuthConfig, McpAuthType, McpRegistryServer, McpServer, McpTransport } from '@stitch/shared/mcp/types';
import { MCP_AUTH_TYPES, MCP_TRANSPORT_TYPES } from '@stitch/shared/mcp/types';

export const AUTH_TYPE_LABELS: Record<McpAuthType, { label: string; description: string }> = {
  none: { label: 'No auth', description: 'Open server, no credentials needed' },
  api_key: { label: 'API key', description: 'Bearer token sent as Authorization header' },
  headers: { label: 'Custom headers', description: 'Arbitrary static headers (e.g. X-API-Token)' },
  oauth: { label: 'OAuth', description: 'Authorize in your browser (PKCE, auto-registration)' },
};

export type HeaderEntry = { id: string; key: string; value: string };

export type AddFormState = {
  name: string;
  url: string;
  transport: McpTransport;
  authType: McpAuthType;
  apiKey: string;
  headers: HeaderEntry[];
  oauthScopes: string;
  oauthClientId: string;
  oauthClientSecret: string;
};

type HomeTab = 'configured' | 'marketplace';

export type View =
  | { type: 'home'; tab: HomeTab }
  | { type: 'add-custom'; returnTab: HomeTab }
  | { type: 'preview'; server: McpServer; returnTab: HomeTab }
  | { type: 'install'; server: McpRegistryServer; returnTab: HomeTab };

export const EMPTY_ADD_FORM: AddFormState = {
  name: '',
  url: '',
  transport: 'http',
  authType: 'none',
  apiKey: '',
  headers: [],
  oauthScopes: '',
  oauthClientId: '',
  oauthClientSecret: '',
};

export const addMcpServerSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    url: z.url('Enter a valid URL, e.g. https://mcp.example.com'),
    transport: z.enum(MCP_TRANSPORT_TYPES),
    authType: z.enum(MCP_AUTH_TYPES),
    apiKey: z.string(),
    headers: z.array(z.object({ id: z.string(), key: z.string(), value: z.string() })),
    oauthScopes: z.string(),
    oauthClientId: z.string(),
    oauthClientSecret: z.string(),
  })
  .refine((value) => value.authType !== 'api_key' || value.apiKey.trim().length > 0, {
    message: 'API key is required',
    path: ['apiKey'],
  })
  .refine(
    (value) =>
      value.authType !== 'headers' ||
      value.headers.some(({ key, value: headerValue }) => key.trim() && headerValue.trim()),
    { message: 'At least one header name and value is required', path: ['headers'] },
  );

function clearCredentialPlaceholder(value: string): string {
  const trimmed = value.trim();
  if (/^YOUR(?:[_ -]|$)/i.test(trimmed)) return '';
  if (/^(?:<[^>]+>|\$\{[^}]+\}|\{\{[^}]+\}\})$/.test(trimmed)) return '';
  return value;
}

function parseScopes(raw: string): string[] | undefined {
  const scopes = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return scopes.length > 0 ? scopes : undefined;
}

export function buildAuthConfig(form: AddFormState): McpAuthConfig {
  if (form.authType === 'api_key') {
    return { type: 'api_key', apiKey: form.apiKey.trim() };
  }
  if (form.authType === 'headers') {
    const headers: Record<string, string> = {};
    for (const { key, value } of form.headers) {
      if (key.trim() && value.trim()) headers[key.trim()] = value.trim();
    }
    return { type: 'headers', headers };
  }
  if (form.authType === 'oauth') {
    return {
      type: 'oauth',
      scopes: parseScopes(form.oauthScopes),
      clientId: form.oauthClientId.trim() || undefined,
      clientSecret: form.oauthClientSecret.trim() || undefined,
    };
  }
  return { type: 'none' };
}

export function applyAuthConfigToForm(form: AddFormState, authConfig: McpAuthConfig): AddFormState {
  if (authConfig.type === 'api_key') {
    return { ...form, authType: 'api_key', apiKey: clearCredentialPlaceholder(authConfig.apiKey), headers: [] };
  }

  if (authConfig.type === 'headers') {
    return {
      ...form,
      authType: 'headers',
      apiKey: '',
      headers: Object.entries(authConfig.headers).map(([key, value]) => ({
        id: crypto.randomUUID(),
        key,
        value: clearCredentialPlaceholder(value),
      })),
    };
  }

  if (authConfig.type === 'oauth') {
    return {
      ...form,
      authType: 'oauth',
      apiKey: '',
      headers: [],
      oauthScopes: authConfig.scopes?.join(' ') ?? '',
      oauthClientId: clearCredentialPlaceholder(authConfig.clientId ?? ''),
      oauthClientSecret: clearCredentialPlaceholder(authConfig.clientSecret ?? ''),
    };
  }

  return { ...form, authType: 'none', apiKey: '', headers: [] };
}

export function describeAuthConfig(authConfig: McpAuthConfig): string {
  return AUTH_TYPE_LABELS[authConfig.type].label;
}
