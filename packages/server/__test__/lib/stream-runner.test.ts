import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { PrefixedString, StoredPart } from '@openwork/shared';
import type { LanguageModelUsage, ModelMessage } from 'ai';
import type { ProviderCredentials } from '@/provider/provider.js';

import { ContextOverflowError, StreamAbortedError } from '@/lib/stream-errors.js';
import { runStream } from '@/lib/stream-runner.js';

const mocks = vi.hoisted(() => {
  const broadcastMock = vi.fn(async () => {});
  const executeStepWithRetryMock = vi.fn();
  const checkAndHandleDoomLoopMock = vi.fn();
  const getModelLimitsMock = vi.fn(async () => ({ context: 200_000, output: 8_192 }));
  const compactMock = vi.fn(async () => 'continue' as const);
  const isOverflowMock = vi.fn(() => false);
  const createToolsMock = vi.fn(() => ({}));
  const insertValuesMock = vi.fn(async () => {});
  const dbInsertMock = vi.fn(() => ({ values: insertValuesMock }));
  return {
    broadcastMock,
    executeStepWithRetryMock,
    checkAndHandleDoomLoopMock,
    getModelLimitsMock,
    compactMock,
    isOverflowMock,
    createToolsMock,
    insertValuesMock,
    dbInsertMock,
  };
});

vi.mock('@/lib/sse.js', () => ({
  broadcast: mocks.broadcastMock,
}));

vi.mock('@/llm/step-executor.js', () => ({
  executeStepWithRetry: mocks.executeStepWithRetryMock,
}));

vi.mock('@/llm/doom-loop.js', () => ({
  checkAndHandleDoomLoop: mocks.checkAndHandleDoomLoopMock,
}));

vi.mock('@/llm/compaction.js', () => ({
  compact: mocks.compactMock,
  getModelLimits: mocks.getModelLimitsMock,
  isOverflow: mocks.isOverflowMock,
}));

vi.mock('@/tools/index.js', () => ({
  createTools: mocks.createToolsMock,
  MAX_STEPS: 3,
  MAX_STEPS_WARNING: vi.fn((maxSteps: number) => `warning-${maxSteps}`),
}));

vi.mock('@/provider/provider.js', () => ({
  createProvider: vi.fn(() => vi.fn(() => ({ id: 'mock-model' }))),
}));

vi.mock('@/db/client.js', () => ({
  getDb: vi.fn(() => ({
    insert: mocks.dbInsertMock,
  })),
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

    mocks.executeStepWithRetryMock.mockResolvedValue({
      finishReason: 'stop',
      usage: ZERO_USAGE,
      toolCalls: [],
      responseMessages: [],
      protocolViolationCount: 0,
    });
    mocks.checkAndHandleDoomLoopMock.mockImplementation(async ({ currentState }) => currentState);
    mocks.getModelLimitsMock.mockResolvedValue({ context: 200_000, output: 8_192 });
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

  test('marks in-flight tool calls as aborted and skips compaction on abort', async () => {
    mocks.executeStepWithRetryMock.mockImplementationOnce(async (opts: { accumulatedParts: StoredPart[] }) => {
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
    });

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

  test('repairs missing tool results before persist', async () => {
    mocks.executeStepWithRetryMock.mockImplementationOnce(async (opts: { accumulatedParts: StoredPart[] }) => {
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
    });

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
});
