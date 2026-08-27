import type { PrefixedString } from '../id/index.js';
import type { McpAuthStatus, McpElicitationAction, McpElicitationRequest } from './types.js';

export const MCP_EVENT_NAMES = [
  'mcp.tools.changed',
  'mcp.auth.status_changed',
  'mcp.elicitation.requested',
  'mcp.elicitation.resolved',
] as const;

export type McpEvents = {
  'mcp.tools.changed': { serverId: PrefixedString<'mcp'>; serverName: string; toolCount: number | null };
  'mcp.auth.status_changed': { serverId: PrefixedString<'mcp'>; authStatus: McpAuthStatus };
  'mcp.elicitation.requested': { elicitation: McpElicitationRequest };
  'mcp.elicitation.resolved': {
    elicitationId: PrefixedString<'mcpel'>;
    sessionId: PrefixedString<'ses'>;
    action: McpElicitationAction;
  };
};
