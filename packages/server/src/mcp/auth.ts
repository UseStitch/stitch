import type { McpAuthConfig } from '@stitch/shared/mcp/types';

export function buildAuthHeaders(authConfig: McpAuthConfig): Record<string, string> {
  if (authConfig.type === 'api_key') {
    return { Authorization: `Bearer ${authConfig.apiKey}` };
  }
  if (authConfig.type === 'headers') {
    return authConfig.headers;
  }
  return {};
}
