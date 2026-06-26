import type { Tool, ToolExecuteFunction } from 'ai';

import { GoogleApiError } from './client.js';

type GoogleToolErrorResult = {
  error: string;
  message: string;
  retryable: boolean;
};

type GoogleToolErrorClassifier = {
  error: string;
  message: string;
  retryable: boolean;
  matches: (error: GoogleApiError) => boolean;
};

const GOOGLE_TOOL_ERROR_CLASSIFIERS: GoogleToolErrorClassifier[] = [
  {
    error: 'insufficient_google_permissions',
    message:
      "You aren't allowed to perform this action because the connected Google account does not have enough permissions.",
    retryable: false,
    matches: isInsufficientScopeError,
  },
];

export function wrapGoogleToolErrors(tools: Record<string, Tool>): Record<string, Tool> {
  return Object.fromEntries(
    Object.entries(tools).map(([name, currentTool]) => [name, wrapGoogleToolError(currentTool)]),
  );
}

function wrapGoogleToolError(currentTool: Tool): Tool {
  if (!currentTool.execute) {
    return currentTool;
  }

  const execute = currentTool.execute as ToolExecuteFunction<unknown, unknown>;

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

export function classifyGoogleToolError(error: unknown): GoogleToolErrorResult | null {
  if (!(error instanceof GoogleApiError)) {
    return null;
  }

  const classifier = GOOGLE_TOOL_ERROR_CLASSIFIERS.find((item) => item.matches(error));
  if (!classifier) {
    return null;
  }

  return {
    error: classifier.error,
    message: classifier.message,
    retryable: classifier.retryable,
  };
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
