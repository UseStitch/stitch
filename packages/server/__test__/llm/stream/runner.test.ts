import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import {
  ContextOverflowError,
  PermissionRejectedError,
  StreamAbortedError,
} from '@/llm/stream/errors.js';
import { runStream } from '@/llm/stream/runner.js';
import type { ProviderCredentials } from '@/provider/provider.js';
import type { LanguageModelUsage, ModelMessage } from 'ai';

const mocks = vi.hoisted(() => {
  const broadcastMock = vi.fn(async () => {});
  const executeStepWithRetryMock = vi.fn();
  const checkAndHandleDoomLoopMock = vi.fn();
  const getModelLimitsMock = vi.fn(async () => ({ context: 200_000, output: 8_192 }));
  const getCompactionSettingsMock = vi.fn(async () => ({ auto: true, prune: true }));
  const compactMock = vi.fn(async () => 'continue' as const);
  const isOverflowMock = vi.fn(() => false);
  const createToolsMock = vi.fn(() => ({}));
  const getDisabledToolNamesMock = vi.fn(async () => new Set<string>());
  const createMcpToolsForAgentMock = vi.fn(async () => ({}));
  const insertValuesMock = vi.fn(async () => {});
  const dbInsertMock = vi.fn(() => ({ values: insertValuesMock }));
  return {
    broadcastMock,
    executeStepWithRetryMock,
    checkAndHandleDoomLoopMock,
    getModelLimitsMock,
    getCompactionSettingsMock,
    compactMock,
    isOverflowMock,
    createToolsMock,
    getDisabledToolNamesMock,
    createMcpToolsForAgentMock,
    insertValuesMock,
    dbInsertMock,
  };
});

vi.mock('@/lib/sse.js', () => ({
  broadcast: mocks.broadcastMock,
}));

vi.mock('@/llm/stream/step-executor.js', () => ({
  executeStepWithRetry: mocks.executeStepWithRetryMock,
}));

vi.mock('@/llm/stream/doom-loop.js', () => ({
  checkAndHandleDoomLoop: mocks.checkAndHandleDoomLoopMock,
}));

vi.mock('@/llm/compaction.js', () => ({
  compact: mocks.compactMock,
  getCompactionSettings: mocks.getCompactionSettingsMock,
  getModelLimits: mocks.getModelLimitsMock,
  isOverflow: mocks.isOverflowMock,
}));

vi.mock('@/tools/runtime/registry.js', () => ({
  createTools: mocks.createToolsMock,
  MAX_STEPS: 3,
  MAX_STEPS_WARNING: vi.fn((maxSteps: number) => `warning-${maxSteps}`),
}));

vi.mock('@/agents/config/tool-config.js', () => ({
  getDisabledToolNames: mocks.getDisabledToolNamesMock,
}));

vi.mock('@/mcp/tool-executor.js', () => ({
  createMcpToolsForAgent: mocks.createMcpToolsForAgentMock,
}));

vi.mock('@/provider/provider.js', () => ({
  createProvider: vi.fn(() => vi.fn(() => ({ id: 'mock-model' }))),
}));

vi.mock('@/db/client.js', () => ({
  getDb: vi.fn(() => ({
    insert: mocks.dbInsertMock,
  })),
}));

vi.mock('@/chat/service.js', () => ({
  markSessionUnread: vi.fn(async () => {}),
}));

const ZERO_USAGE: LanguageModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
};

function getDefaultMessages(): ModelMessage[] {
  return [{ role: 'user', content: 'Hello' }];
}

function getDefaultOpts() {
  const credentials: ProviderCredentials = {
    providerId: 'openai',
    auth: { method: 'api-key', apiKey: 'test-key' },
  };

  return {
    sessionId: 'ses_1' as PrefixedString<'ses'>,
    assistantMessageId: 'msg_1' as PrefixedString<'msg'>,
    modelId: 'openai/gpt-5.3-codex',
    agentId: 'agt_1' as PrefixedString<'agt'>,
    llmMessages: getDefaultMessages(),
    credentials,
    abortSignal: new AbortController().signal,
  };
}

describe('runStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.broadcastMock.mockReset();
    mocks.executeStepWithRetryMock.mockReset();
    mocks.checkAndHandleDoomLoopMock.mockReset();
    mocks.getModelLimitsMock.mockReset();
    mocks.getCompactionSettingsMock.mockReset();
    mocks.compactMock.mockReset();
    mocks.isOverflowMock.mockReset();
    mocks.createToolsMock.mockReset();
    mocks.getDisabledToolNamesMock.mockReset();
    mocks.insertValuesMock.mockReset();
    mocks.dbInsertMock.mockReset();

    mocks.broadcastMock.mockResolvedValue(undefined);
    mocks.createToolsMock.mockReturnValue({});
    mocks.getDisabledToolNamesMock.mockResolvedValue(new Set<string>());
    mocks.dbInsertMock.mockReturnValue({ values: mocks.insertValuesMock });
    mocks.insertValuesMock.mockResolvedValue(undefined);

    mocks.executeStepWithRetryMock.mockResolvedValue({
      finishReason: 'stop',
      usage: ZERO_USAGE,
      toolCalls: [],
      responseMessages: [],
      protocolViolationCount: 0,
    });
    mocks.checkAndHandleDoomLoopMock.mockImplementation(async ({ currentState }) => currentState);
    mocks.getModelLimitsMock.mockResolvedValue({ context: 200_000, output: 8_192 });
    mocks.getCompactionSettingsMock.mockResolvedValue({ auto: true, prune: true });
    mocks.isOverflowMock.mockReturnValue(false);
    mocks.compactMock.mockResolvedValue('continue');
  });

  test('completes normally and skips compaction when not needed', async () => {
    await runStream(getDefaultOpts());

    expect(mocks.executeStepWithRetryMock).toHaveBeenCalledTimes(1);
    expect(mocks.compactMock).not.toHaveBeenCalled();

    const events = mocks.broadcastMock.mock.calls.map((call) => String(call.at(0)));
    expect(events).toContain('stream-start');
    expect(events).toContain('stream-finish');
  });

  test('continues to next step when tool calls exist even if finish reason is stop', async () => {
    mocks.executeStepWithRetryMock.mockResolvedValueOnce({
      finishReason: 'stop',
      usage: ZERO_USAGE,
      toolCalls: [{ toolName: 'bash', inputJson: '{"command":"pwd"}' }],
      responseMessages: [],
      protocolViolationCount: 0,
    });

    await runStream(getDefaultOpts());

    expect(mocks.executeStepWithRetryMock).toHaveBeenCalledTimes(2);
    expect(mocks.checkAndHandleDoomLoopMock).toHaveBeenCalledTimes(1);
  });

  test('runs final synthesis fallback when tool results exist without user-facing text', async () => {
    mocks.executeStepWithRetryMock.mockImplementationOnce(
      async (opts: { accumulatedParts: StoredPart[] }) => {
        opts.accumulatedParts.push({
          type: 'tool-call',
          id: 'prt_call_1' as StoredPart['id'],
          toolCallId: 'call_1',
          toolName: 'bash',
          input: { command: 'pwd' },
          startedAt: 1,
          endedAt: 1,
        } as StoredPart);
        opts.accumulatedParts.push({
          type: 'tool-result',
          id: 'prt_result_1' as StoredPart['id'],
          toolCallId: 'call_1',
          toolName: 'bash',
          output: { output: 'C:/Users/mahar' },
          truncated: false,
          startedAt: 1,
          endedAt: 1,
        } as StoredPart);

        return {
          finishReason: 'stop',
          usage: ZERO_USAGE,
          toolCalls: [],
          responseMessages: [],
          protocolViolationCount: 0,
        };
      },
    );

    await runStream(getDefaultOpts());

    expect(mocks.executeStepWithRetryMock).toHaveBeenCalledTimes(1);
    const insertedAssistant = mocks.insertValuesMock.mock.calls.at(0)?.at(0) as
      | { finishReason: string; parts: StoredPart[] }
      | undefined;
    if (!insertedAssistant) {
      throw new Error('assistant message was not inserted');
    }
    expect(insertedAssistant.finishReason).toBe('error');
    expect(insertedAssistant.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text-delta',
          text: 'I could not produce a final response after running tools. Please retry this request.',
        }),
      ]),
    );
  });

  test('runs final synthesis when only pre-tool text exists without trailing answer', async () => {
    mocks.executeStepWithRetryMock.mockImplementationOnce(
      async (opts: { accumulatedParts: StoredPart[] }) => {
        opts.accumulatedParts.push({
          type: 'text-delta',
          id: 'prt_text_1' as StoredPart['id'],
          text: 'I will check that for you.',
          startedAt: 1,
          endedAt: 1,
        } as StoredPart);
        opts.accumulatedParts.push({
          type: 'tool-call',
          id: 'prt_call_1' as StoredPart['id'],
          toolCallId: 'call_1',
          toolName: 'bash',
          input: { command: 'pwd' },
          startedAt: 1,
          endedAt: 1,
        } as StoredPart);
        opts.accumulatedParts.push({
          type: 'tool-result',
          id: 'prt_result_1' as StoredPart['id'],
          toolCallId: 'call_1',
          toolName: 'bash',
          output: { output: 'C:/Users/mahar' },
          truncated: false,
          startedAt: 1,
          endedAt: 1,
        } as StoredPart);

        return {
          finishReason: 'stop',
          usage: ZERO_USAGE,
          toolCalls: [],
          responseMessages: [],
          protocolViolationCount: 0,
        };
      },
    );

    await runStream(getDefaultOpts());

    expect(mocks.executeStepWithRetryMock).toHaveBeenCalledTimes(1);
  });

  test('retries once when finish reason is tool-calls without parsed tool call records', async () => {
    mocks.executeStepWithRetryMock
      .mockResolvedValueOnce({
        finishReason: 'tool-calls',
        usage: ZERO_USAGE,
        toolCalls: [],
        responseMessages: [],
        protocolViolationCount: 0,
      })
      .mockResolvedValueOnce({
        finishReason: 'stop',
        usage: ZERO_USAGE,
        toolCalls: [],
        responseMessages: [],
        protocolViolationCount: 0,
      });

    await runStream(getDefaultOpts());

    expect(mocks.executeStepWithRetryMock).toHaveBeenCalledTimes(2);
  });

  test('retries once when finish reason is unknown without tool calls', async () => {
    mocks.executeStepWithRetryMock
      .mockResolvedValueOnce({
        finishReason: 'unknown',
        usage: ZERO_USAGE,
        toolCalls: [],
        responseMessages: [],
        protocolViolationCount: 0,
      })
      .mockResolvedValueOnce({
        finishReason: 'stop',
        usage: ZERO_USAGE,
        toolCalls: [],
        responseMessages: [],
        protocolViolationCount: 0,
      });

    await runStream(getDefaultOpts());

    expect(mocks.executeStepWithRetryMock).toHaveBeenCalledTimes(2);
  });

  test('disables tools on final max step', async () => {
    mocks.executeStepWithRetryMock
      .mockResolvedValueOnce({
        finishReason: 'tool-calls',
        usage: ZERO_USAGE,
        toolCalls: [{ toolName: 'bash', inputJson: '{"command":"pwd"}' }],
        responseMessages: [],
        protocolViolationCount: 0,
      })
      .mockResolvedValueOnce({
        finishReason: 'tool-calls',
        usage: ZERO_USAGE,
        toolCalls: [{ toolName: 'read', inputJson: '{"filePath":"README.md"}' }],
        responseMessages: [],
        protocolViolationCount: 0,
      })
      .mockResolvedValueOnce({
        finishReason: 'stop',
        usage: ZERO_USAGE,
        toolCalls: [],
        responseMessages: [],
        protocolViolationCount: 0,
      });

    await runStream(getDefaultOpts());

    expect(mocks.executeStepWithRetryMock).toHaveBeenCalledTimes(3);
    const finalCall = mocks.executeStepWithRetryMock.mock.calls.at(2)?.at(0) as
      | { tools?: Record<string, unknown> }
      | undefined;
    expect(finalCall?.tools).toEqual({});
  });

  test('triggers compaction after context overflow', async () => {
    mocks.executeStepWithRetryMock.mockRejectedValue(new ContextOverflowError());

    await runStream(getDefaultOpts());

    expect(mocks.compactMock).toHaveBeenCalledTimes(1);
    expect(mocks.compactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'ses_1',
        providerId: 'openai',
        modelId: 'openai/gpt-5.3-codex',
        auto: true,
        overflow: true,
      }),
    );
  });

  test('skips auto compaction when compaction.auto is disabled', async () => {
    mocks.getCompactionSettingsMock.mockResolvedValue({ auto: false, prune: true });
    mocks.isOverflowMock.mockReturnValue(true);
    mocks.executeStepWithRetryMock.mockResolvedValue({
      finishReason: 'stop',
      usage: {
        inputTokens: 180_000,
        outputTokens: 20_000,
        totalTokens: 200_000,
        inputTokenDetails: { noCacheTokens: 180_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokenDetails: { textTokens: 20_000, reasoningTokens: 0 },
      },
      toolCalls: [],
      responseMessages: [],
      protocolViolationCount: 0,
    });

    await runStream(getDefaultOpts());

    expect(mocks.compactMock).not.toHaveBeenCalled();
    expect(mocks.isOverflowMock).not.toHaveBeenCalled();
  });

  test('marks in-flight tool calls as aborted and skips compaction on abort', async () => {
    mocks.executeStepWithRetryMock.mockImplementationOnce(
      async (opts: { accumulatedParts: StoredPart[] }) => {
        opts.accumulatedParts.push({
          type: 'tool-call',
          id: 'prt_call_1' as StoredPart['id'],
          toolCallId: 'call_1',
          toolName: 'bash',
          input: { command: 'pwd' },
          startedAt: 1,
          endedAt: 1,
        } as StoredPart);
        throw new StreamAbortedError();
      },
    );

    await runStream(getDefaultOpts());

    expect(mocks.compactMock).not.toHaveBeenCalled();

    const insertedAssistant = mocks.insertValuesMock.mock.calls.at(0)?.at(0) as
      | { finishReason: string; parts: StoredPart[] }
      | undefined;
    if (!insertedAssistant) {
      throw new Error('assistant message was not inserted');
    }
    expect(insertedAssistant.finishReason).toBe('aborted');
    expect(insertedAssistant.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool-result',
          toolCallId: 'call_1',
          output: { error: 'Aborted' },
        }),
      ]),
    );
  });

  test('rethrows unknown errors after finalization', async () => {
    mocks.executeStepWithRetryMock.mockRejectedValue(new Error('boom'));

    await expect(runStream(getDefaultOpts())).rejects.toThrow('boom');

    const events = mocks.broadcastMock.mock.calls.map((call) => String(call.at(0)));
    expect(events).toContain('stream-error');
    expect(events).toContain('stream-finish');
    expect(mocks.insertValuesMock).toHaveBeenCalledTimes(1);
  });

  test('runs error-path synthesis when tools completed but no trailing user text', async () => {
    const boom = new Error('boom');

    mocks.executeStepWithRetryMock.mockImplementationOnce(
      async (opts: { accumulatedParts: StoredPart[] }) => {
        opts.accumulatedParts.push({
          type: 'tool-call',
          id: 'prt_call_1' as StoredPart['id'],
          toolCallId: 'call_1',
          toolName: 'bash',
          input: { command: 'pwd' },
          startedAt: 1,
          endedAt: 1,
        } as StoredPart);
        opts.accumulatedParts.push({
          type: 'tool-result',
          id: 'prt_result_1' as StoredPart['id'],
          toolCallId: 'call_1',
          toolName: 'bash',
          output: { output: 'C:/Users/mahar' },
          truncated: false,
          startedAt: 1,
          endedAt: 1,
        } as StoredPart);
        throw boom;
      },
    );

    await expect(runStream(getDefaultOpts())).rejects.toThrow('boom');

    expect(mocks.executeStepWithRetryMock).toHaveBeenCalledTimes(1);

    const insertedAssistant = mocks.insertValuesMock.mock.calls.at(0)?.at(0) as
      | { finishReason: string; parts: StoredPart[] }
      | undefined;
    if (!insertedAssistant) {
      throw new Error('assistant message was not inserted');
    }

    expect(insertedAssistant.finishReason).toBe('error');
    expect(insertedAssistant.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text-delta',
          text: 'I hit an internal error after running tools and could not complete the final response. Please retry this request.',
        }),
      ]),
    );
  });

  test('continues with original error when no tool results exist for error fallback', async () => {
    const boom = new Error('boom');

    mocks.executeStepWithRetryMock.mockRejectedValueOnce(boom);

    await expect(runStream(getDefaultOpts())).rejects.toThrow('boom');
    expect(mocks.executeStepWithRetryMock).toHaveBeenCalledTimes(1);
  });

  test('repairs missing tool results before persist', async () => {
    mocks.executeStepWithRetryMock.mockImplementationOnce(
      async (opts: { accumulatedParts: StoredPart[] }) => {
        opts.accumulatedParts.push({
          type: 'tool-call',
          id: 'prt_call_1' as StoredPart['id'],
          toolCallId: 'call_missing',
          toolName: 'webfetch',
          input: { url: 'https://example.com' },
          startedAt: 1,
          endedAt: 1,
        } as StoredPart);

        return {
          finishReason: 'stop',
          usage: ZERO_USAGE,
          toolCalls: [],
          responseMessages: [],
          protocolViolationCount: 0,
        };
      },
    );

    await runStream(getDefaultOpts());

    const insertedAssistant = mocks.insertValuesMock.mock.calls.at(0)?.at(0) as
      | { parts: StoredPart[] }
      | undefined;
    if (!insertedAssistant) {
      throw new Error('assistant message was not inserted');
    }

    expect(insertedAssistant.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool-result',
          toolCallId: 'call_missing',
          output: { error: 'Missing tool result' },
        }),
      ]),
    );
  });

  test('preserves real tool results from parallel calls when permission is rejected', async () => {
    mocks.executeStepWithRetryMock.mockImplementationOnce(
      async (opts: { accumulatedParts: StoredPart[] }) => {
        opts.accumulatedParts.push({
          type: 'tool-call',
          id: 'prt_call_search' as StoredPart['id'],
          toolCallId: 'call_search',
          toolName: 'web_search_exa',
          input: { query: 'frc 2026' },
          startedAt: 1,
          endedAt: 1,
        } as StoredPart);
        opts.accumulatedParts.push({
          type: 'tool-call',
          id: 'prt_call_fetch' as StoredPart['id'],
          toolCallId: 'call_fetch',
          toolName: 'webfetch',
          input: { url: 'https://example.com' },
          startedAt: 1,
          endedAt: 1,
        } as StoredPart);
        opts.accumulatedParts.push({
          type: 'tool-result',
          id: 'prt_result_fetch' as StoredPart['id'],
          toolCallId: 'call_fetch',
          toolName: 'webfetch',
          output: { error: 'PermissionRejectedError: User rejected tool execution for webfetch' },
          truncated: false,
          startedAt: 1,
          endedAt: 1,
        } as StoredPart);
        opts.accumulatedParts.push({
          type: 'tool-result',
          id: 'prt_result_search' as StoredPart['id'],
          toolCallId: 'call_search',
          toolName: 'web_search_exa',
          output: { results: 'Blue Alliance won' },
          truncated: false,
          startedAt: 1,
          endedAt: 1,
        } as StoredPart);
        throw new PermissionRejectedError('webfetch');
      },
    );

    await runStream(getDefaultOpts());

    const insertedAssistant = mocks.insertValuesMock.mock.calls.at(0)?.at(0) as
      | { finishReason: string; parts: StoredPart[] }
      | undefined;
    if (!insertedAssistant) {
      throw new Error('assistant message was not inserted');
    }

    expect(insertedAssistant.finishReason).toBe('blocked');

    const searchResult = insertedAssistant.parts.find(
      (p): p is StoredPart & { type: 'tool-result' } =>
        p.type === 'tool-result' && p.toolCallId === 'call_search',
    );
    expect(searchResult).toBeDefined();
    expect(searchResult?.output).toEqual({ results: 'Blue Alliance won' });

    const syntheticResults = insertedAssistant.parts.filter(
      (p): p is StoredPart & { type: 'tool-result' } =>
        p.type === 'tool-result' &&
        (p.output as Record<string, unknown>)?.error === 'Missing tool result',
    );
    expect(syntheticResults).toHaveLength(0);
  });
});
