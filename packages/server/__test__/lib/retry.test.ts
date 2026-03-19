import { describe, expect, test } from 'vitest';

import { extractErrorInfo, isRetryable } from '@/lib/retry.js';

describe('retry helpers', () => {
  test('returns retry message for rate-limited errors', () => {
    const info = extractErrorInfo({
      name: 'APICallError',
      message: 'Too many requests',
      statusCode: 429,
    });

    expect(info.category).toBe('rate_limited');
    expect(isRetryable(info)).toBe('Rate limited');
  });

  test('does not retry context overflow', () => {
    const info = extractErrorInfo({
      name: 'InvalidPromptError',
      message: 'Request exceeds the context window.',
    });

    expect(info.isContextOverflow).toBe(true);
    expect(isRetryable(info)).toBeUndefined();
  });

  test('keeps overloaded message behavior', () => {
    const info = extractErrorInfo({
      name: 'Error',
      message: 'Provider is Overloaded',
    });

    expect(info.category).toBe('api_error');
    expect(isRetryable(info)).toBe('Provider is overloaded');
  });
});
