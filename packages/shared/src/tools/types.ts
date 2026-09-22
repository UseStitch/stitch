import { z } from 'zod';

import type { JsonValue } from '../json.js';

const TOOL_TYPES = ['stitch', 'mcp', 'plugin'] as const;

export type ToolType = (typeof TOOL_TYPES)[number];

export const TOOL_ENABLED_SCOPES = ['tool', 'toolset', 'mcp_tool', 'app', 'skill'] as const;

export type ToolEnabledScope = (typeof TOOL_ENABLED_SCOPES)[number];

export type ToolEnabledState = { scope: ToolEnabledScope; identifier: string; enabled: boolean };

type ToolDataResult = { data: JsonValue };

/**
 * Cross-package protocol for a failed tool result. Packages that cannot import the server's
 * ToolError class return this instead; resultNormalizationMiddleware converts it into a throw.
 * `error` is the message shown to the model and the user, so it must be human-readable.
 * Adding any key other than `details` makes isToolErrorResult reject the value and it will be
 * treated as ordinary tool data.
 */
const toolErrorResultSchema = z.object({ error: z.string().min(1), details: z.json().optional() }).strict();
const toolDataResultSchema = z.looseObject({ data: z.json() });
const legacyToolFailureSchema = z.looseObject({ failed: z.literal(true), output: z.string().optional() });

export type ToolErrorResult = { error: string; details?: JsonValue };

export function toolError(error: string, details?: JsonValue): ToolErrorResult {
  return details === undefined ? { error } : { error, details };
}

export function isToolErrorResult(value: JsonValue | undefined): value is ToolErrorResult {
  return toolErrorResultSchema.safeParse(value).success;
}

export function isToolDataResult(value: JsonValue | undefined): value is ToolDataResult {
  const result = toolDataResultSchema.safeParse(value);
  return result.success && !Object.hasOwn(result.data, 'error');
}

const TOOL_FAILURE_FALLBACK_MESSAGE = 'Tool execution failed';

/**
 * Returns the message to report for a failed tool result, or null when the result is a success.
 * Recognizes the ToolErrorResult protocol plus legacy results that report failure with `failed: true`.
 */
export function getToolFailureMessage(output: JsonValue | undefined): string | null {
  if (isToolErrorResult(output)) {
    return output.error;
  }

  const result = legacyToolFailureSchema.safeParse(output);
  if (!result.success) return null;

  return result.data.output && result.data.output.trim().length > 0
    ? result.data.output
    : TOOL_FAILURE_FALLBACK_MESSAGE;
}
