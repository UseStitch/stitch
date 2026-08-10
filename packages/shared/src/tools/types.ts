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

/**
 * Cross-package protocol for a failed tool result. Packages that cannot import the server's
 * ToolError class return this instead; resultNormalizationMiddleware converts it into a throw.
 * `error` is the message shown to the model and the user, so it must be human-readable.
 * Adding any key other than `details` makes isToolErrorResult reject the value and it will be
 * treated as ordinary tool data.
 */
export type ToolErrorResult = { error: string; details?: unknown; data?: never };

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
