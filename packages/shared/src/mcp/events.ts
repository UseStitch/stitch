import type { McpAuthStatus } from './types.js';

export const MCP_EVENT_NAMES = ['mcp-tools-changed', 'mcp-auth-status-changed'] as const;

export type McpEvents = {
  'mcp-tools-changed': { serverId: string; serverName: string; toolCount: number | null };
  'mcp-auth-status-changed': { serverId: string; authStatus: McpAuthStatus };
};
