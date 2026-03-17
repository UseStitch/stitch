import { describe, test, expect } from 'vitest';

import type { StoredPart } from '@openwork/shared';

import { buildHistoryMessages, isOverflow } from '@/llm/compaction.js';
import { estimate } from '@/utils/token.js';

describe('estimate', () => {
  test('returns 0 for null', () => {
    expect(estimate(null)).toBe(0);
  });

  test('returns 0 for undefined', () => {
    expect(estimate(undefined)).toBe(0);
  });

  test('estimates string tokens as ceil(length / 4)', () => {
    expect(estimate('hello')).toBe(2); // 5 / 4 = 1.25 → 2
    expect(estimate('abcd')).toBe(1); // 4 / 4 = 1
    expect(estimate('')).toBe(0);
  });

  test('stringifies objects before estimating', () => {
    const obj = { key: 'value' };
    const json = JSON.stringify(obj);
    expect(estimate(obj)).toBe(Math.ceil(json.length / 4));
  });

  test('handles numbers', () => {
    expect(estimate(12345)).toBe(Math.ceil('12345'.length / 4));
  });
});

describe('isOverflow', () => {
  const defaultLimits = { context: 200_000, output: 8_192 };

  test('returns false when context limit is 0', () => {
    const usage = {
      inputTokens: 100_000,
      outputTokens: 50_000,
      totalTokens: 150_000,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
    };
    expect(isOverflow(usage, { context: 0, output: 8_192 })).toBe(false);
  });

  test('returns false when usage is well below limit', () => {
    const usage = {
      inputTokens: 10_000,
      outputTokens: 5_000,
      totalTokens: 15_000,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
    };
    expect(isOverflow(usage, defaultLimits)).toBe(false);
  });

  test('returns true when totalTokens exceeds usable context', () => {
    // usable = context - output = 200_000 - 8_192 = 191_808
    const usage = {
      inputTokens: 180_000,
      outputTokens: 15_000,
      totalTokens: 195_000,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
    };
    expect(isOverflow(usage, defaultLimits)).toBe(true);
  });

  test('uses input limit when available', () => {
    // With input limit: usable = input - min(20_000, output) = 128_000 - 8_192 = 119_808
    const limits = { context: 200_000, input: 128_000, output: 8_192 };
    const belowUsage = {
      inputTokens: 100_000,
      outputTokens: 10_000,
      totalTokens: 110_000,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
    };
    expect(isOverflow(belowUsage, limits)).toBe(false);

    const aboveUsage = {
      inputTokens: 110_000,
      outputTokens: 15_000,
      totalTokens: 125_000,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
    };
    expect(isOverflow(aboveUsage, limits)).toBe(true);
  });

  test('falls back to inputTokens + outputTokens when totalTokens is undefined', () => {
    // usable = 200_000 - 8_192 = 191_808
    const usage = {
      inputTokens: 180_000,
      outputTokens: 15_000,
      totalTokens: undefined as unknown as number,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
    };
    // count = undefined → (180_000 + 15_000) = 195_000 > 191_808
    expect(isOverflow(usage, defaultLimits)).toBe(true);
  });

  test('handles edge case at exact boundary', () => {
    // usable = 200_000 - 8_192 = 191_808
    const atBoundary = {
      inputTokens: 150_000,
      outputTokens: 41_808,
      totalTokens: 191_808,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
    };
    expect(isOverflow(atBoundary, defaultLimits)).toBe(true);

    const belowBoundary = {
      inputTokens: 150_000,
      outputTokens: 41_807,
      totalTokens: 191_807,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
    };
    expect(isOverflow(belowBoundary, defaultLimits)).toBe(false);
  });
});

describe('buildHistoryMessages', () => {
  const timing = { startedAt: 1, endedAt: 1 };

  function textPart(text: string): StoredPart {
    return {
      type: 'text-delta',
      id: 'prt_text' as StoredPart['id'],
      text,
      ...timing,
    } as StoredPart;
  }

  function toolCallPart(toolCallId: string, toolName = 'bash'): StoredPart {
    return {
      type: 'tool-call',
      id: `prt_call_${toolCallId}` as StoredPart['id'],
      toolCallId,
      toolName,
      input: { command: 'pwd' },
      ...timing,
    } as StoredPart;
  }

  function toolResultPart(toolCallId: string, output: unknown, toolName = 'bash'): StoredPart {
    return {
      type: 'tool-result',
      id: `prt_result_${toolCallId}` as StoredPart['id'],
      toolCallId,
      toolName,
      output,
      truncated: false,
      ...timing,
    } as StoredPart;
  }

  test('keeps matched tool-call and tool-result pairs', () => {
    const result = buildHistoryMessages([
      {
        role: 'assistant',
        isSummary: false,
        modelId: 'test-model',
        parts: [toolCallPart('tc_1'), toolResultPart('tc_1', { ok: true })],
      },
    ]);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ role: 'system' });
    expect(result[1]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: 'tc_1' }],
    });
    expect(result[2]).toMatchObject({
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: 'tc_1' }],
    });
  });

  test('drops unmatched tool-call parts from history', () => {
    const result = buildHistoryMessages([
      {
        role: 'assistant',
        isSummary: false,
        modelId: 'test-model',
        parts: [toolCallPart('tc_missing')],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ role: 'system' });
  });

  test('keeps assistant text even when tool-call is unmatched', () => {
    const result = buildHistoryMessages([
      {
        role: 'assistant',
        isSummary: false,
        modelId: 'test-model',
        parts: [textPart('hello'), toolCallPart('tc_missing')],
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ role: 'system' });
    expect(result[1]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'hello' }],
    });
  });

  test('maps error outputs to error-json tool results', () => {
    const result = buildHistoryMessages([
      {
        role: 'assistant',
        isSummary: false,
        modelId: 'test-model',
        parts: [toolCallPart('tc_err'), toolResultPart('tc_err', { error: 'Command was aborted' })],
      },
    ]);

    expect(result[2]).toMatchObject({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'tc_err',
          output: { type: 'error-json', value: { error: 'Command was aborted' } },
        },
      ],
    });
  });

  test('adds system prompt with environment and model id', () => {
    const result = buildHistoryMessages([
      {
        role: 'user',
        isSummary: false,
        modelId: 'openai/gpt-5.3-codex',
        parts: [textPart('hello')],
      },
    ]);

    expect(result[0]).toMatchObject({ role: 'system' });
    expect(typeof result[0]?.content).toBe('string');
    expect(result[0]?.content).toContain('<env>');
    expect(result[0]?.content).toContain('Model id: openai/gpt-5.3-codex');
    expect(result[0]?.content).toContain('Preferred shell:');
    expect(result[0]?.content).toContain('You are Agentloops a local machine assistant.');
  });

  test('throws when called with empty history', () => {
    expect(() => buildHistoryMessages([])).toThrow(
      'buildHistoryMessages requires at least one message',
    );
  });
});
