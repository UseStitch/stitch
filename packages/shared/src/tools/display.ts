import { parseMcpToolName } from '../mcp/types.js';

export function humanizeToolName(name: string): string {
  return (parseMcpToolName(name)?.toolName ?? name)
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
