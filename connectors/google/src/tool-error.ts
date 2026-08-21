import { toolError } from '@stitch/shared/tools/types';
import type { ToolErrorResult } from '@stitch/shared/tools/types';

import { GoogleApiError } from './client.js';

import type { Tool } from 'ai';

export function wrapGoogleToolErrors(tools: Record<string, Tool>): Record<string, Tool> {
  return Object.fromEntries(
    Object.entries(tools).map(([name, currentTool]) => [name, wrapGoogleToolError(currentTool)]),
  );
}

function wrapGoogleToolError(currentTool: Tool): Tool {
  const execute: Tool['execute'] = currentTool.execute;
  if (!execute) {
    return currentTool;
  }

  return {
    ...currentTool,
    execute: async (input, options) => {
      try {
        return await execute(input, options);
      } catch (error) {
        const result = classifyGoogleToolError(error);

        if (!result) {
          throw error;
        }

        return result;
      }
    },
  };
}

export function classifyGoogleToolError(error: unknown): ToolErrorResult | null {
  if (!(error instanceof GoogleApiError) || !isInsufficientScopeError(error)) {
    return null;
  }

  return toolError(
    "You aren't allowed to perform this action because the connected Google account does not have enough permissions.",
    { code: 'insufficient_google_permissions', retryable: false },
  );
}

function isInsufficientScopeError(error: GoogleApiError): boolean {
  if (error.status !== 403) {
    return false;
  }

  if (error.authChallenge?.toLowerCase().includes('insufficient_scope')) {
    return true;
  }

  if (error.reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
    return true;
  }

  if (error.reasons.some((reason) => reason.toLowerCase() === 'insufficientpermissions')) {
    return true;
  }

  return /insufficient authentication scopes|insufficient permission/i.test(error.message);
}
