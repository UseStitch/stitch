import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { StoredPart } from '@stitch/shared/chat/messages';

import { PermissionRejectedError, StreamAbortedError } from '@/lib/stream-errors.js';
import { executeStepWithRetry, type StepOptions } from '@/llm/step-executor.js';
import type { LanguageModelUsage } from 'ai';

const ZERO_USAGE: LanguageModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
};

const mocks = vi.hoisted(() => {
  const streamTextMock = vi.fn();
  return {
    streamTextMock,
  };
});

vi.mock('ai', () => ({
  streamText: mocks.streamTextMock,
  smoothStream: vi.fn(() => undefined),
}));

describe('executeStepWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('preserves terminal tool errors that arrive with abort signal', async () => {
    mocks.streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield {
          type: 'tool-error',
          toolCallId: 'call_1',
          toolName: 'bash',
          error: 'command failed',
        };
      })(),
      response: Promise.resolve({ messages: [] }),
    });

    const abortController = new AbortController();
    abortController.abort();

    const accumulatedParts: StoredPart[] = [];
    const model = {} as unknown as StepOptions['model'];
    const tools = {} as unknown as StepOptions['tools'];

    await expect(
      executeStepWithRetry({
        sessionId: 'ses_1',
        messageId: 'msg_1',
        step: 0,
        model,
        conversation: [],
        accumulatedParts,
        providerId: 'openai',
        tools,
        abortSignal: abortController.signal,
        streamRunId: 'run_1',
      }),
    ).rejects.toBeInstanceOf(StreamAbortedError);

    expect(accumulatedParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool-result',
          toolCallId: 'call_1',
          toolName: 'bash',
          output: { error: 'command failed' },
        }),
      ]),
    );
  });

  test('flushes buffered text when stream ends without text-end', async () => {
    mocks.streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-start' };
        yield { type: 'text-delta', text: 'Hello from tool summary' };
        yield { type: 'finish', finishReason: 'stop', totalUsage: ZERO_USAGE };
      })(),
      response: Promise.resolve({ messages: [] }),
    });

    const accumulatedParts: StoredPart[] = [];
    const model = {} as unknown as StepOptions['model'];
    const tools = {} as unknown as StepOptions['tools'];

    const result = await executeStepWithRetry({
      sessionId: 'ses_1',
      messageId: 'msg_1',
      step: 0,
      model,
      conversation: [],
      accumulatedParts,
      providerId: 'openai',
      tools,
      abortSignal: new AbortController().signal,
      streamRunId: 'run_1',
    });

    expect(result.finishReason).toBe('stop');
    expect(accumulatedParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text-delta',
          text: 'Hello from tool summary',
        }),
      ]),
    );
  });

  test('returns step result when provider response messages fail after finish', async () => {
    mocks.streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-start' };
        yield { type: 'text-delta', text: 'Done.' };
        yield { type: 'finish', finishReason: 'stop', totalUsage: ZERO_USAGE };
      })(),
      response: Promise.reject(new Error('response read failed')),
    });

    const accumulatedParts: StoredPart[] = [];
    const model = {} as unknown as StepOptions['model'];
    const tools = {} as unknown as StepOptions['tools'];

    const result = await executeStepWithRetry({
      sessionId: 'ses_1',
      messageId: 'msg_1',
      step: 0,
      model,
      conversation: [],
      accumulatedParts,
      providerId: 'openai',
      tools,
      abortSignal: new AbortController().signal,
      streamRunId: 'run_1',
    });

    expect(result.finishReason).toBe('stop');
    expect(result.responseMessages).toEqual([]);
    expect(accumulatedParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text-delta',
          text: 'Done.',
        }),
      ]),
    );
  });

  test('suppresses retry when step fails after tool side effects', async () => {
    mocks.streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'bash',
          input: { command: 'pwd' },
        };
        throw new Error('provider stream failed after tool call');
      })(),
      response: Promise.resolve({ messages: [] }),
    });

    const accumulatedParts: StoredPart[] = [];
    const model = {} as unknown as StepOptions['model'];
    const tools = {} as unknown as StepOptions['tools'];

    const result = await executeStepWithRetry({
      sessionId: 'ses_1',
      messageId: 'msg_1',
      step: 0,
      model,
      conversation: [],
      accumulatedParts,
      providerId: 'openai',
      tools,
      abortSignal: new AbortController().signal,
      streamRunId: 'run_1',
    });

    expect(mocks.streamTextMock).toHaveBeenCalledTimes(1);
    expect(result.finishReason).toBe('tool-calls');
    expect(result.toolCalls).toEqual([
      expect.objectContaining({ toolName: 'bash', inputJson: '{"command":"pwd"}' }),
    ]);
  });

  test('collects parallel tool results before propagating permission rejection', async () => {
    const permissionError = new PermissionRejectedError('webfetch');

    mocks.streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield {
          type: 'tool-call',
          toolCallId: 'call_search',
          toolName: 'web_search_exa',
          input: { query: 'frc 2026' },
        };
        yield {
          type: 'tool-call',
          toolCallId: 'call_fetch',
          toolName: 'webfetch',
          input: { url: 'https://example.com' },
        };
        yield {
          type: 'tool-error',
          toolCallId: 'call_fetch',
          toolName: 'webfetch',
          error: permissionError,
        };
        yield {
          type: 'tool-result',
          toolCallId: 'call_search',
          toolName: 'web_search_exa',
          input: { query: 'frc 2026' },
          output: { results: 'Blue Alliance won' },
        };
        yield { type: 'finish', finishReason: 'tool-calls', totalUsage: ZERO_USAGE };
      })(),
      response: Promise.resolve({ messages: [] }),
    });

    const accumulatedParts: StoredPart[] = [];
    const model = {} as unknown as StepOptions['model'];
    const tools = {} as unknown as StepOptions['tools'];

    await expect(
      executeStepWithRetry({
        sessionId: 'ses_1',
        messageId: 'msg_1',
        step: 0,
        model,
        conversation: [],
        accumulatedParts,
        providerId: 'openai',
        tools,
        abortSignal: new AbortController().signal,
        streamRunId: 'run_1',
      }),
    ).rejects.toBeInstanceOf(PermissionRejectedError);

    const searchResult = accumulatedParts.find(
      (p): p is StoredPart & { type: 'tool-result' } =>
        p.type === 'tool-result' && p.toolCallId === 'call_search',
    );
    expect(searchResult).toBeDefined();
    expect(searchResult?.output).toEqual({ results: 'Blue Alliance won' });
  });
});
