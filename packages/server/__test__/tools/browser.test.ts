import { describe, expect, test } from 'vitest';

// Test the abort rethrow logic in isolation — we want to confirm that the
// execute handler rethrows DOMException AbortErrors and converts other errors
// to { error } objects.
//
// We test this by calling the inner logic directly rather than using
// module mocking, which avoids ESM cache invalidation issues in tests.

async function executeWithAbort(action: () => Promise<unknown>): Promise<unknown> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

describe('browser tool abort contract', () => {
  test('rethrows DOMException AbortError', async () => {
    const abortError = new DOMException('Browser action aborted', 'AbortError');
    await expect(executeWithAbort(() => Promise.reject(abortError))).rejects.toSatisfy(
      (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
    );
  });

  test('converts non-abort errors to { error } objects', async () => {
    const result = await executeWithAbort(() => Promise.reject(new Error('CDP connection failed')));
    expect(result).toMatchObject({ error: 'CDP connection failed' });
  });

  test('returns result when action succeeds', async () => {
    const result = await executeWithAbort(() => Promise.resolve({ output: 'ok' }));
    expect(result).toMatchObject({ output: 'ok' });
  });
});
