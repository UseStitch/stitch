import { describe, expect, test } from 'vitest';

import { calculateMessageCostUsd } from '@/utils/cost.js';
import type { LanguageModelUsage } from 'ai';

function buildUsage(input: {
  inputTokens?: number;
  outputTokens?: number;
  noCacheTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): LanguageModelUsage {
  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputTokenDetails: {
      noCacheTokens: input.noCacheTokens ?? inputTokens,
      cacheReadTokens: input.cacheReadTokens ?? 0,
      cacheWriteTokens: input.cacheWriteTokens ?? 0,
    },
    outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 },
  };
}

describe('calculateMessageCostUsd', () => {
  test('returns 0 when model pricing is unavailable', async () => {
    const cost = await calculateMessageCostUsd({
      providerId: 'openai',
      modelId: 'openai/gpt-5.3-codex',
      usage: buildUsage({ inputTokens: 1_000, outputTokens: 500 }),
      providers: {
        openai: {
          id: 'openai',
          name: 'OpenAI',
          env: [],
          models: {
            'openai/gpt-5.3-codex': {
              id: 'openai/gpt-5.3-codex',
              name: 'GPT-5.3 Codex',
              release_date: '2026-01-01',
              attachment: false,
              reasoning: true,
              temperature: true,
              tool_call: true,
              limit: { context: 200_000, output: 8_192 },
              options: {},
            },
          },
        },
      } as never,
    });

    expect(cost).toBe(0);
  });

  test('calculates input and output cost per million tokens', async () => {
    const cost = await calculateMessageCostUsd({
      providerId: 'openai',
      modelId: 'openai/gpt-5.3-codex',
      usage: buildUsage({ inputTokens: 1_000_000, outputTokens: 500_000 }),
      providers: {
        openai: {
          id: 'openai',
          name: 'OpenAI',
          env: [],
          models: {
            'openai/gpt-5.3-codex': {
              id: 'openai/gpt-5.3-codex',
              name: 'GPT-5.3 Codex',
              release_date: '2026-01-01',
              attachment: false,
              reasoning: true,
              temperature: true,
              tool_call: true,
              cost: { input: 2, output: 8 },
              limit: { context: 200_000, output: 8_192 },
              options: {},
            },
          },
        },
      } as never,
    });

    expect(cost).toBe(6);
  });

  test('uses cache-specific rates and over-200k context rates', async () => {
    const cost = await calculateMessageCostUsd({
      providerId: 'anthropic',
      modelId: 'anthropic/claude',
      usage: buildUsage({
        inputTokens: 250_000,
        outputTokens: 100_000,
        noCacheTokens: 100_000,
        cacheReadTokens: 100_000,
        cacheWriteTokens: 50_000,
      }),
      providers: {
        anthropic: {
          id: 'anthropic',
          name: 'Anthropic',
          env: [],
          models: {
            'anthropic/claude': {
              id: 'anthropic/claude',
              name: 'Claude',
              release_date: '2026-01-01',
              attachment: false,
              reasoning: true,
              temperature: true,
              tool_call: true,
              cost: {
                input: 3,
                output: 15,
                cache_read: 0.3,
                cache_write: 3.75,
                context_over_200k: {
                  input: 6,
                  output: 22.5,
                  cache_read: 0.6,
                  cache_write: 7.5,
                },
              },
              limit: { context: 300_000, output: 8_192 },
              options: {},
            },
          },
        },
      } as never,
    });

    expect(cost).toBe(3.285);
  });
});
