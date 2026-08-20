import { describe, expect, test } from 'bun:test';

import { isRetryable } from '@/lib/retry.js';
import { mapAIError } from '@/llm/stream/ai-error-mapper.js';

describe('retry helpers', () => {
  test('returns retry message for rate-limited errors', () => {
    const info = mapAIError({ name: 'APICallError', message: 'Too many requests', statusCode: 429 });

    expect(info.category).toBe('rate_limited');
    expect(isRetryable(info)).toBe('Rate limited');
  });

  test('does not retry context overflow', () => {
    const info = mapAIError({ name: 'InvalidPromptError', message: 'Request exceeds the context window.' });

    expect(info.isContextOverflow).toBe(true);
    expect(isRetryable(info)).toBeUndefined();
  });

  test('keeps overloaded message behavior', () => {
    const info = mapAIError({ name: 'Error', message: 'Provider is Overloaded' });

    expect(info.category).toBe('api_error');
    expect(isRetryable(info)).toBe('Provider is overloaded');
  });
});
