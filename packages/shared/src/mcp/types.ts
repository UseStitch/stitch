import type { PrefixedString } from '../id/index.js';

export const MCP_TRANSPORT_TYPES = ['stdio', 'http'] as const;
export type McpTransport = (typeof MCP_TRANSPORT_TYPES)[number];

export const MCP_AUTH_TYPES = ['none', 'api_key', 'headers', 'oauth'] as const;
export type McpAuthType = (typeof MCP_AUTH_TYPES)[number];

export type NoneAuth = { type: 'none' };
export type ApiKeyAuth = { type: 'api_key'; apiKey: string };
export type HeadersAuth = { type: 'headers'; headers: Record<string, string> };

/**
 * OAuth configuration holds only what the user enters. Live secrets
 * (access/refresh tokens, DCR-registered client info, discovery state) live in
 * a separate table, never in `authConfig`, and are never returned to the FE.
 */
export type OAuthAuth = {
  type: 'oauth';
  scopes?: string[];
  clientId?: string;
  clientSecret?: string;
};

export type McpAuthConfig = NoneAuth | ApiKeyAuth | HeadersAuth | OAuthAuth;

export const MCP_AUTH_STATUSES = [
  'none',
  'connected',
  'awaiting_auth',
  'reauthorization_required',
  'client_registration_required',
  'error',
] as const;
export type McpAuthStatus = (typeof MCP_AUTH_STATUSES)[number];

export type McpRegistryServerInstall = {
  name: string;
  transport: McpTransport;
  url: string;
  authConfig: McpAuthConfig;
  optionalAuthConfigs?: McpAuthConfig[];
};

export type McpRegistryServer = {
  $schema?: string;
  id: string;
  name: string;
  description: string;
  homepageUrl?: string;
  docsUrl: string;
  logoUrl?: string;
  tags: string[];
  install: McpRegistryServerInstall;
};

export type McpRegistryPayload = {
  version: number;
  generatedAt: string;
  servers: McpRegistryServer[];
};

export type McpServer = {
  id: PrefixedString<'mcp'>;
  name: string;
  transport: McpTransport;
  url: string;
  authConfig: McpAuthConfig;
  authStatus: McpAuthStatus;
  createdAt: number;
  updatedAt: number;
};

export type McpTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  icons?: McpIcon[];
};

export type McpIcon = {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: 'light' | 'dark';
};

const MCP_SERVER_ID_LENGTH = 30; // "mcp_" (4) + 26 body chars

/** Formats a tool name for the AI SDK tools map by combining the server ID and tool name. */
export function formatMcpToolName(serverId: string, toolName: string): string {
  return `${serverId}_${toolName}`;
}

/** Parses a tool name back into its components. Returns null if not an MCP tool name. */
export function parseMcpToolName(
  prefixedName: string,
): { serverId: string; toolName: string } | null {
  if (!prefixedName.startsWith('mcp_')) return null;
  if (prefixedName.length <= MCP_SERVER_ID_LENGTH + 1) return null;
  const serverId = prefixedName.slice(0, MCP_SERVER_ID_LENGTH);
  const sep = prefixedName[MCP_SERVER_ID_LENGTH];
  if (sep !== '_') return null;
  const toolName = prefixedName.slice(MCP_SERVER_ID_LENGTH + 1);
  if (!toolName) return null;
  return { serverId, toolName };
}
