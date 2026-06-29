import { describe, expect, test } from 'bun:test';

import { normalizeUsage } from '@/utils/usage.js';
import type { LanguageModelUsage } from 'ai';

describe('normalizeUsage', () => {
  test('returns zeros for missing usage', () => {
    expect(normalizeUsage(null)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      noCacheTokens: 0,
      totalTokens: 0,
    });
  });

  test('prefers a finite provider total', () => {
    const usage: LanguageModelUsage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 123,
      inputTokenDetails: { noCacheTokens: 70, cacheReadTokens: 20, cacheWriteTokens: 10 },
      outputTokenDetails: { textTokens: 40, reasoningTokens: 10 },
    };

    expect(normalizeUsage(usage)).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 10,
      cacheReadTokens: 20,
      cacheWriteTokens: 10,
      noCacheTokens: 70,
      totalTokens: 123,
    });
  });

  test('falls back to token details when total is absent', () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: undefined,
      inputTokenDetails: { cacheReadTokens: 20, cacheWriteTokens: 10 },
      outputTokenDetails: { reasoningTokens: 15 },
    } as unknown as LanguageModelUsage;

    expect(normalizeUsage(usage)).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 15,
      cacheReadTokens: 20,
      cacheWriteTokens: 10,
      noCacheTokens: 70,
      totalTokens: 195,
    });
  });

  test('treats non-finite values as zero', () => {
    const usage = {
      inputTokens: Number.NaN,
      outputTokens: Number.POSITIVE_INFINITY,
      totalTokens: Number.NaN,
      inputTokenDetails: { cacheReadTokens: 5, cacheWriteTokens: Number.NEGATIVE_INFINITY },
      outputTokenDetails: { reasoningTokens: 7 },
    } as unknown as LanguageModelUsage;

    expect(normalizeUsage(usage)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 7,
      cacheReadTokens: 5,
      cacheWriteTokens: 0,
      noCacheTokens: 0,
      totalTokens: 12,
    });
  });
});
