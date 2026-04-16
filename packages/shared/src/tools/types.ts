export const TOOL_TYPES = ['stitch', 'mcp', 'plugin'] as const;

export type ToolType = (typeof TOOL_TYPES)[number];

type ToolDataResult<T = unknown> = {
  data: T;
  error?: never;
  details?: never;
};

type ToolErrorResult = {
  error: string;
  details?: unknown;
  data?: never;
};

export function isToolErrorResult(value: unknown): value is ToolErrorResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { error?: unknown; details?: unknown };
  if (typeof candidate.error !== 'string' || candidate.error.length === 0) {
    return false;
  }

  const keys = Object.keys(value as Record<string, unknown>);
  return keys.every((key) => key === 'error' || key === 'details');
}

export function isToolDataResult<T = unknown>(value: unknown): value is ToolDataResult<T> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { data?: unknown; error?: unknown };
  return 'data' in candidate && !('error' in candidate);
}
