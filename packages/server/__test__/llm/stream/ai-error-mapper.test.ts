import { APICallError } from 'ai';
import { describe, expect, test } from 'vitest';

import { mapAIError } from '@/llm/stream/ai-error-mapper.js';
import { StreamPartError } from '@/llm/stream/errors.js';

describe('mapAIError', () => {
  test('maps APICallError 429 to rate_limited and retryable', () => {
    const error = new APICallError({
      message: 'Rate limit exceeded',
      url: 'https://api.example.com/v1/chat',
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: { 'retry-after': '2' },
      responseBody: '{"error":{"code":"rate_limit"}}',
      isRetryable: true,
    });

    const result = mapAIError(error, 'openai');

    expect(result.category).toBe('rate_limited');
    expect(result.isRetryable).toBe(true);
    expect(result.responseHeaders?.['retry-after']).toBe('2');
    expect(result.isContextOverflow).toBe(false);
  });

  test('maps APICallError overflow to context_overflow and non-retryable', () => {
    const error = new APICallError({
      message: 'This request exceeds the context window.',
      url: 'https://api.example.com/v1/chat',
      requestBodyValues: {},
      statusCode: 400,
      responseHeaders: {},
      responseBody: '{"error":{"code":"context_length_exceeded"}}',
      isRetryable: true,
    });

    const result = mapAIError(error, 'openai');

    expect(result.category).toBe('context_overflow');
    expect(result.isContextOverflow).toBe(true);
    expect(result.isRetryable).toBe(false);
  });

  test('maps unsupported model APICallError to unsupported and non-retryable', () => {
    const error = new APICallError({
      message:
        'undefined: You invoked an unsupported model or your request did not allow prompt caching. See the documentation for more information.',
      url: 'https://api.example.com/v1/chat',
      requestBodyValues: {},
      statusCode: 403,
      responseHeaders: {},
      responseBody: '',
      isRetryable: true,
    });

    const result = mapAIError(error);

    expect(result.category).toBe('unsupported');
    expect(result.isRetryable).toBe(false);
    expect(result.isContextOverflow).toBe(false);
  });

  test('maps named SDK-style errors without APICallError shape', () => {
    const result = mapAIError({
      name: 'UnsupportedFunctionalityError',
      message: 'tool choice type is unsupported',
    });

    expect(result.category).toBe('unsupported');
    expect(result.aiErrorName).toBe('UnsupportedFunctionalityError');
    expect(result.isRetryable).toBe(false);
  });

  test('unwraps StreamPartError cause to preserve original APICallError context', () => {
    const cause = new APICallError({
      message:
        'undefined: You invoked an unsupported model or your request did not allow prompt caching. See the documentation for more information.',
      url: 'https://api.example.com/v1/chat',
      requestBodyValues: {},
      statusCode: 403,
      responseHeaders: {},
      responseBody: '',
      isRetryable: true,
    });
    const wrapped = new StreamPartError(cause.message, { cause });

    const result = mapAIError(wrapped);

    expect(result.category).toBe('unsupported');
    expect(result.isRetryable).toBe(false);
    expect(result.statusCode).toBe(403);
  });

  test('maps retry exhaustion and no-output classes', () => {
    const retryExhausted = mapAIError({
      name: 'RetryError',
      message: 'All retry attempts exhausted',
    });
    const noOutput = mapAIError({
      name: 'NoObjectGeneratedError',
      message: 'No object was generated',
    });

    expect(retryExhausted.category).toBe('retry_exhausted');
    expect(retryExhausted.isRetryable).toBe(false);
    expect(noOutput.category).toBe('no_output');
    expect(noOutput.isRetryable).toBe(false);
  });
});
