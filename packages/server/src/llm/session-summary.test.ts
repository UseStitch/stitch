import { describe, test, expect, beforeEach } from 'bun:test';

import type { StoredPart } from '@stitch/shared/chat/messages';

import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { isOverflow, buildActiveToolsetInstructionsBlock } from '@/llm/session-summary.js';
import { buildHistoryMessages } from '@/llm/history-messages.js';
import { setSessionToolsetState } from '@/llm/stream/session-toolsets.js';
import { registerToolset, unregisterToolset, listToolsetIds } from '@/tools/toolsets/registry.js';

setupTestDb();

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
    // usable = context - maxOutput = 200_000 - 8_192 = 191_808
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
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 200, cacheWriteTokens: 300 },
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
    };
    // count = undefined → 180_000 + 15_000 + 200 + 300 = 195_500 > 191_808
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

  test('caps max output tokens to avoid zero usable context', () => {
    const limits = { context: 256_000, output: 256_000 };
    const usage = {
      inputTokens: 7_000,
      outputTokens: 200,
      totalTokens: 7_200,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
    };

    // max output is capped to 32k, so usable = 224k and this should not overflow.
    expect(isOverflow(usage, limits)).toBe(false);
  });

  test('respects explicit reserved setting override', () => {
    const limits = { context: 400_000, input: 200_000, output: 32_000 };
    const usage = {
      inputTokens: 194_000,
      outputTokens: 0,
      totalTokens: 194_000,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
    };

    expect(isOverflow(usage, limits)).toBe(true);
    expect(isOverflow(usage, limits, { reserved: 5_000 })).toBe(false);
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
    const result = buildHistoryMessages(
      [
        {
          role: 'assistant',
          isSummary: false,
          modelId: 'test-model',
          parts: [toolCallPart('tc_1'), toolResultPart('tc_1', { ok: true })],
        },
      ],
      {
        useBasePrompt: true,
        systemPrompt: null,
        userName: '',
        userTimezone: '',
        memoryContext: null,
        todoContext: null,
      },
    );

    // 2 system messages (static + semi-static) + assistant + tool
    const systemMessages = result.filter((m) => m.role === 'system');
    expect(systemMessages.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toMatchObject({ role: 'system' });

    const nonSystem = result.filter((m) => m.role !== 'system');
    expect(nonSystem).toHaveLength(2);
    expect(nonSystem[0]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: 'tc_1' }],
    });
    expect(nonSystem[1]).toMatchObject({
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: 'tc_1' }],
    });
  });

  test('drops unmatched tool-call parts from history', () => {
    const result = buildHistoryMessages(
      [
        {
          role: 'assistant',
          isSummary: false,
          modelId: 'test-model',
          parts: [toolCallPart('tc_missing')],
        },
      ],
      {
        useBasePrompt: true,
        systemPrompt: null,
        userName: '',
        userTimezone: '',
        memoryContext: null,
        todoContext: null,
      },
    );

    // Unmatched tool-call is dropped
    const nonSystem = result.filter((m) => m.role !== 'system');
    expect(nonSystem).toHaveLength(0);
    expect(result[0]).toMatchObject({ role: 'system' });
  });

  test('keeps assistant text even when tool-call is unmatched', () => {
    const result = buildHistoryMessages(
      [
        {
          role: 'assistant',
          isSummary: false,
          modelId: 'test-model',
          parts: [textPart('hello'), toolCallPart('tc_missing')],
        },
      ],
      {
        useBasePrompt: true,
        systemPrompt: null,
        userName: '',
        userTimezone: '',
        memoryContext: null,
        todoContext: null,
      },
    );

    const nonSystem = result.filter((m) => m.role !== 'system');
    expect(nonSystem).toHaveLength(1);
    expect(nonSystem[0]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'hello' }],
    });
  });

  test('maps error outputs to error-json tool results', () => {
    const result = buildHistoryMessages(
      [
        {
          role: 'assistant',
          isSummary: false,
          modelId: 'test-model',
          parts: [
            toolCallPart('tc_err'),
            toolResultPart('tc_err', { error: 'Command was aborted' }),
          ],
        },
      ],
      {
        useBasePrompt: true,
        systemPrompt: null,
        userName: '',
        userTimezone: '',
        memoryContext: null,
        todoContext: null,
      },
    );

    const toolMessages = result.filter((m) => m.role === 'tool');
    expect(toolMessages).toHaveLength(1);
    expect(toolMessages[0]).toMatchObject({
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

  test('adds system prompt with environment', () => {
    const result = buildHistoryMessages(
      [
        {
          role: 'user',
          isSummary: false,
          modelId: 'openai/gpt-5.3-codex',
          parts: [textPart('hello')],
        },
      ],
      {
        useBasePrompt: true,
        systemPrompt: null,
        userName: '',
        userTimezone: '',
        memoryContext: null,
        todoContext: null,
      },
    );

    const systemMessages = result.filter((m) => m.role === 'system');
    expect(systemMessages.length).toBeGreaterThanOrEqual(2);

    // Static layer contains identity
    expect(systemMessages[0].content).toContain('You are Stitch, a local machine assistant');
    // Semi-static layer contains env
    expect(systemMessages[1].content).toContain('<env>');
    expect(systemMessages[1].content).toContain('Preferred shell:');
  });

  test('uses custom system prompt when base prompt is disabled', () => {
    const result = buildHistoryMessages(
      [
        {
          role: 'user',
          isSummary: false,
          modelId: 'openai/gpt-5.3-codex',
          parts: [textPart('hello')],
        },
      ],
      {
        useBasePrompt: false,
        systemPrompt: 'Custom system prompt for testing',
        userName: '',
        userTimezone: '',
        memoryContext: null,
        todoContext: null,
      },
    );

    const systemMessages = result.filter((m) => m.role === 'system');
    expect(systemMessages.length).toBeGreaterThanOrEqual(2);
    // Semi-static layer contains env and custom prompt
    expect(systemMessages[1].content).toContain('<env>');
    expect(systemMessages[1].content).toContain('<user-instructions>');
    expect(systemMessages[1].content).toContain('Custom system prompt for testing');
    expect(systemMessages[1].content).toContain('</user-instructions>');
  });

  test('appends custom system prompt when base prompt is enabled', () => {
    const result = buildHistoryMessages(
      [
        {
          role: 'user',
          isSummary: false,
          modelId: 'openai/gpt-5.3-codex',
          parts: [textPart('hello')],
        },
      ],
      {
        useBasePrompt: true,
        systemPrompt: 'Extra user instruction',
        userName: '',
        userTimezone: '',
        memoryContext: null,
        todoContext: null,
      },
    );

    const systemMessages = result.filter((m) => m.role === 'system');
    expect(systemMessages.length).toBeGreaterThanOrEqual(2);
    // Semi-static layer contains env and user instruction
    expect(systemMessages[1].content).toContain('<env>');
    expect(systemMessages[1].content).toContain('<user-instructions>');
    expect(systemMessages[1].content).toContain('Extra user instruction');
    expect(systemMessages[1].content).toContain('</user-instructions>');
  });

  test('omits user instructions block when custom system prompt is empty', () => {
    const result = buildHistoryMessages(
      [
        {
          role: 'user',
          isSummary: false,
          modelId: 'openai/gpt-5.3-codex',
          parts: [textPart('hello')],
        },
      ],
      {
        useBasePrompt: true,
        systemPrompt: '   ',
        userName: '',
        userTimezone: '',
        memoryContext: null,
        todoContext: null,
      },
    );

    const systemMessages = result.filter((m) => m.role === 'system');
    expect(systemMessages[1].content).toContain('<env>');
    expect(systemMessages[1].content).not.toContain('<user-instructions>');
  });

  test('includes user profile name in system prompt when provided', () => {
    const result = buildHistoryMessages(
      [
        {
          role: 'user',
          isSummary: false,
          modelId: 'openai/gpt-5.3-codex',
          parts: [textPart('hello')],
        },
      ],
      {
        useBasePrompt: true,
        systemPrompt: null,
        userName: 'Jane',
        userTimezone: '',
        memoryContext: null,
        todoContext: null,
      },
    );

    // Static layer contains identity with user name
    const systemMessages = result.filter((m) => m.role === 'system');
    expect(systemMessages[0].content).toContain('helps Jane with day-to-day tasks');
  });

  test('includes user timezone in system prompt environment when provided', () => {
    const result = buildHistoryMessages(
      [
        {
          role: 'user',
          isSummary: false,
          modelId: 'openai/gpt-5.3-codex',
          parts: [textPart('hello')],
        },
      ],
      {
        useBasePrompt: true,
        systemPrompt: null,
        userName: '',
        userTimezone: 'America/New_York',
        memoryContext: null,
        todoContext: null,
      },
    );

    // Semi-static layer contains env with timezone
    const systemMessages = result.filter((m) => m.role === 'system');
    expect(systemMessages[1].content).toContain('User timezone: America/New_York');
  });

  test('throws when called with empty history', () => {
    expect(() =>
      buildHistoryMessages([], {
        useBasePrompt: true,
        systemPrompt: null,
        userName: '',
        userTimezone: '',
        memoryContext: null,
        todoContext: null,
      }),
    ).toThrow('buildHistoryMessages requires at least one message');
  });

  function imagePart(dataUrl = 'data:image/png;base64,AAAA', mime = 'image/png'): StoredPart {
    return {
      type: 'user-image',
      id: 'prt_img' as StoredPart['id'],
      dataUrl,
      mime,
      ...timing,
    } as StoredPart;
  }

  function filePart(
    dataUrl = 'data:application/pdf;base64,BBBB',
    mime = 'application/pdf',
    filename = 'doc.pdf',
  ): StoredPart {
    return {
      type: 'user-file',
      id: 'prt_file' as StoredPart['id'],
      dataUrl,
      mime,
      filename,
      ...timing,
    } as StoredPart;
  }

  function userMsg(parts: StoredPart[]) {
    return { role: 'user' as const, isSummary: false, modelId: 'test', parts };
  }

  function assistantMsg(text: string) {
    return {
      role: 'assistant' as const,
      isSummary: false,
      modelId: 'test',
      parts: [textPart(text)],
    };
  }

  test('preserves images within the last 3 assistant turns', () => {
    const msgs = [
      userMsg([textPart('look at this'), imagePart()]),
      assistantMsg('I see the image'),
      userMsg([textPart('and this'), imagePart()]),
      assistantMsg('Got it'),
      userMsg([textPart('last one')]),
      assistantMsg('Done'),
    ];

    const result = buildHistoryMessages(msgs, {
      useBasePrompt: true,
      systemPrompt: null,
      userName: '',
      userTimezone: '',
      memoryContext: null,
      todoContext: null,
    });
    const userMessages = result.filter((m) => m.role === 'user');

    for (const um of userMessages) {
      if (typeof um.content === 'string') continue;
      const parts = um.content as Array<{ type: string; text?: string }>;
      const placeholders = parts.filter(
        (p) => p.type === 'text' && p.text?.includes('already processed'),
      );
      expect(placeholders).toHaveLength(0);
    }

    const firstContent = userMessages[0].content as Array<{ type: string }>;
    const realImages = firstContent.filter((p) => p.type === 'image');
    expect(realImages).toHaveLength(1);
  });

  test('prunes images older than 3 assistant turns', () => {
    const msgs = [
      userMsg([textPart('old image'), imagePart('data:image/png;base64,OLD')]),
      assistantMsg('turn 1'),
      userMsg([textPart('msg 2')]),
      assistantMsg('turn 2'),
      userMsg([textPart('msg 3')]),
      assistantMsg('turn 3'),
      userMsg([textPart('recent image'), imagePart('data:image/png;base64,NEW')]),
      assistantMsg('turn 4'),
    ];

    const result = buildHistoryMessages(msgs, {
      useBasePrompt: true,
      systemPrompt: null,
      userName: '',
      userTimezone: '',
      memoryContext: null,
      todoContext: null,
    });
    const userMessages = result.filter((m) => m.role === 'user');

    const firstUserContent = userMessages[0].content as Array<{ type: string; text?: string }>;
    const imagePlaceholders = firstUserContent.filter(
      (p) => p.type === 'text' && p.text?.includes('already processed'),
    );
    expect(imagePlaceholders).toHaveLength(1);

    const lastImageUser = userMessages[userMessages.length - 1];
    const lastContent = lastImageUser.content as Array<{ type: string }>;
    const realImages = lastContent.filter((p) => p.type === 'image');
    expect(realImages).toHaveLength(1);
  });

  test('prunes file attachments older than 3 assistant turns', () => {
    const msgs = [
      userMsg([textPart('old file'), filePart()]),
      assistantMsg('turn 1'),
      userMsg([textPart('msg 2')]),
      assistantMsg('turn 2'),
      userMsg([textPart('msg 3')]),
      assistantMsg('turn 3'),
      userMsg([textPart('msg 4')]),
      assistantMsg('turn 4'),
    ];

    const result = buildHistoryMessages(msgs, {
      useBasePrompt: true,
      systemPrompt: null,
      userName: '',
      userTimezone: '',
      memoryContext: null,
      todoContext: null,
    });
    const userMessages = result.filter((m) => m.role === 'user');

    const firstUserContent = userMessages[0].content as Array<{ type: string; text?: string }>;
    const filePlaceholders = firstUserContent.filter(
      (p) => p.type === 'text' && p.text?.includes('"doc.pdf" already processed'),
    );
    expect(filePlaceholders).toHaveLength(1);
  });

  test('keeps all images when fewer than 3 assistant turns exist', () => {
    const msgs = [
      userMsg([textPart('image here'), imagePart()]),
      assistantMsg('turn 1'),
      userMsg([textPart('another')]),
      assistantMsg('turn 2'),
    ];

    const result = buildHistoryMessages(msgs, {
      useBasePrompt: true,
      systemPrompt: null,
      userName: '',
      userTimezone: '',
      memoryContext: null,
      todoContext: null,
    });
    const userMessages = result.filter((m) => m.role === 'user');

    const firstContent = userMessages[0].content as Array<{ type: string }>;
    const realImages = firstContent.filter((p) => p.type === 'image');
    expect(realImages).toHaveLength(1);
  });
});

describe('buildActiveToolsetInstructionsBlock', () => {
  const sessionId = 'ses_test_compaction' as never;

  const setActiveToolsets = (ids: string[]) => {
    setSessionToolsetState(sessionId, {
      turnCounter: 0,
      active: ids.map((id) => ({ id, scope: 'until_deactivated' })),
      expired: [],
    });
  };

  beforeEach(() => {
    for (const id of listToolsetIds()) {
      unregisterToolset(id);
    }
    getDb().insert(sessions).values({ id: sessionId, title: 'Compaction test' }).run();
    setActiveToolsets([]);
  });

  test('returns empty string when no toolsets are active', () => {
    const result = buildActiveToolsetInstructionsBlock(sessionId);
    expect(result).toBe('');
  });

  test('returns empty string when active toolsets have no instructions', () => {
    registerToolset({
      id: 'no-instructions',
      kind: 'native',
      name: 'No Instructions',
      description: 'Toolset without instructions',
      tools: () => [],
      activate: async () => ({}),
    });
    setActiveToolsets(['no-instructions']);

    const result = buildActiveToolsetInstructionsBlock(sessionId);
    expect(result).toBe('');
  });

  test('includes instructions for active toolsets that have them', () => {
    registerToolset({
      id: 'browser',
      kind: 'native',
      name: 'Browser',
      description: 'Browser toolset',
      instructions: 'Use browser_navigate to open pages.',
      tools: () => [],
      activate: async () => ({}),
    });
    setActiveToolsets(['browser']);

    const result = buildActiveToolsetInstructionsBlock(sessionId);
    expect(result).toContain('## Active Toolset Instructions');
    expect(result).toContain('### Browser Toolset Instructions');
    expect(result).toContain('Use browser_navigate to open pages.');
  });

  test('omits toolsets that have no instructions even when mixed with ones that do', () => {
    registerToolset({
      id: 'with-instructions',
      kind: 'native',
      name: 'With Instructions',
      description: 'Has instructions',
      instructions: 'Do something specific.',
      tools: () => [],
      activate: async () => ({}),
    });
    registerToolset({
      id: 'without-instructions',
      kind: 'native',
      name: 'Without Instructions',
      description: 'No instructions',
      tools: () => [],
      activate: async () => ({}),
    });
    setActiveToolsets(['with-instructions', 'without-instructions']);

    const result = buildActiveToolsetInstructionsBlock(sessionId);
    expect(result).toContain('### With Instructions Toolset Instructions');
    expect(result).not.toContain('### Without Instructions Toolset Instructions');
  });

  test('includes multiple toolset instruction blocks', () => {
    registerToolset({
      id: 'ts-alpha',
      kind: 'native',
      name: 'Alpha',
      description: 'Alpha',
      instructions: 'Alpha instructions.',
      tools: () => [],
      activate: async () => ({}),
    });
    registerToolset({
      id: 'ts-beta',
      kind: 'native',
      name: 'Beta',
      description: 'Beta',
      instructions: 'Beta instructions.',
      tools: () => [],
      activate: async () => ({}),
    });
    setActiveToolsets(['ts-alpha', 'ts-beta']);

    const result = buildActiveToolsetInstructionsBlock(sessionId);
    expect(result).toContain('### Alpha Toolset Instructions');
    expect(result).toContain('Alpha instructions.');
    expect(result).toContain('### Beta Toolset Instructions');
    expect(result).toContain('Beta instructions.');
  });
});
