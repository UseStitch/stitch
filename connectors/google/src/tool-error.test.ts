import { describe, expect, test } from 'bun:test';
import { isToolErrorResult } from '@stitch/shared/tools/types';

import { GoogleApiError } from './client.js';
import { classifyGoogleToolError, wrapGoogleToolErrors } from './tool-error.js';

import { tool } from 'ai';
import { z } from 'zod';

const insufficientScope = new GoogleApiError(403, 'Request had insufficient authentication scopes.', {
  reasons: ['ACCESS_TOKEN_SCOPE_INSUFFICIENT'],
});

function makeTool(execute: () => Promise<unknown>) {
  return tool({ description: 'test tool', inputSchema: z.object({}), execute });
}

function runWrapped(execute: () => Promise<unknown>) {
  const wrapped = wrapGoogleToolErrors({ gmail: makeTool(execute) });
  return wrapped.gmail.execute?.({}, {} as never);
}

describe('classifyGoogleToolError', () => {
  test('returns a result the shared guard recognizes as a tool failure', () => {
    const result = classifyGoogleToolError(insufficientScope);

    expect(isToolErrorResult(result)).toBe(true);
  });

  test('puts the human-readable message in error and the code in details', () => {
    expect(classifyGoogleToolError(insufficientScope)).toEqual({
      error:
        "You aren't allowed to perform this action because the connected Google account does not have enough permissions.",
      details: { code: 'insufficient_google_permissions', retryable: false },
    });
  });

  test('returns null for unclassified google errors', () => {
    expect(classifyGoogleToolError(new GoogleApiError(500, 'Backend error'))).toBeNull();
  });

  test('returns null for non-google errors', () => {
    expect(classifyGoogleToolError(new Error('boom'))).toBeNull();
  });
});

describe('wrapGoogleToolErrors', () => {
  test('converts a classified error into an error result', async () => {
    const result = await runWrapped(() => Promise.reject(insufficientScope));

    expect(isToolErrorResult(result)).toBe(true);
  });

  test('rethrows errors it cannot classify', () => {
    expect(runWrapped(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });

  test('passes successful results through untouched', async () => {
    expect(await runWrapped(() => Promise.resolve({ messages: [] }))).toEqual({ messages: [] });
  });
});
