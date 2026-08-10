const TOOL_TYPES = ['stitch', 'mcp', 'plugin'] as const;

export type ToolType = (typeof TOOL_TYPES)[number];

export const TOOL_ENABLED_SCOPES = ['tool', 'toolset', 'mcp_tool', 'app'] as const;

export type ToolEnabledScope = (typeof TOOL_ENABLED_SCOPES)[number];

export type ToolEnabledState = {
  scope: ToolEnabledScope;
  identifier: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

type ToolDataResult = { data: unknown; error?: never; details?: never };

type ToolErrorResult = { error: string; details?: unknown; data?: never };

export function isToolErrorResult(value: unknown): value is ToolErrorResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (!('error' in value) || typeof value.error !== 'string' || value.error.length === 0) {
    return false;
  }

  return Object.keys(value).every((key) => key === 'error' || key === 'details');
}

export function isToolDataResult(value: unknown): value is ToolDataResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return 'data' in value && !('error' in value);
}
