import { simulateReadableStream, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import type { StoredPart } from '@stitch/shared/chat/messages';

import { PermissionRejectedError, StreamAbortedError } from '@/llm/stream/errors.js';
import { executeStepWithRetry, type StepOptions } from '@/llm/stream/step-executor.js';

const broadcastMock = vi.fn(async (..._args: unknown[]) => {});

const FINISH_STOP = {
  type: 'finish' as const,
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage: {
    inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 0, text: 0, reasoning: undefined },
  },
};

function makeFinish(reason: 'stop' | 'tool-calls' = 'stop') {
  return {
    ...FINISH_STOP,
    finishReason: { unified: reason, raw: undefined },
  };
}

function createMockModel(doStream: MockLanguageModelV3['doStream']): MockLanguageModelV3 {
  return new MockLanguageModelV3({ doStream });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStreamResult(chunks: any[]) {
  return {
    stream: simulateReadableStream({
      chunks,
      initialDelayInMs: null,
      chunkDelayInMs: null,
    }),
  };
}

function getDefaultOpts(model: MockLanguageModelV3, overrides?: Partial<StepOptions>): StepOptions {
  return {
    sessionId: 'ses_1' as StepOptions['sessionId'],
    messageId: 'msg_1' as StepOptions['messageId'],
    step: 0,
    model: model as unknown as StepOptions['model'],
    conversation: [{ role: 'user', content: 'Hello' }],
    accumulatedParts: [],
    providerId: 'openai',
    tools: {} as StepOptions['tools'],
    abortSignal: new AbortController().signal,
    streamRunId: 'run_1',
    broadcast: broadcastMock as StepOptions['broadcast'],
    ...overrides,
  };
}

describe('executeStepWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    broadcastMock.mockResolvedValue(undefined);
  });

  test('completes a simple text stream and returns stop finish reason', async () => {
    const model = createMockModel(async () =>
      makeStreamResult([
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hello, world!' },
        { type: 'text-end', id: 'text-1' },
        FINISH_STOP,
      ]),
    );

    const opts = getDefaultOpts(model);
    const result = await executeStepWithRetry(opts);

    expect(result.finishReason).toBe('stop');
    expect(result.toolCalls).toEqual([]);
    expect(opts.accumulatedParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text-delta',
          text: 'Hello, world!',
        }),
      ]),
    );
  });

  test('flushes buffered text when stream ends without text-end', async () => {
    const model = createMockModel(async () =>
      makeStreamResult([
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hello from tool summary' },
        FINISH_STOP,
      ]),
    );

    const opts = getDefaultOpts(model);
    const result = await executeStepWithRetry(opts);

    expect(result.finishReason).toBe('stop');
    expect(opts.accumulatedParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text-delta',
          text: 'Hello from tool summary',
        }),
      ]),
    );
  });

  test('accumulates multi-delta text correctly', async () => {
    const model = createMockModel(async () =>
      makeStreamResult([
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hello' },
        { type: 'text-delta', id: 'text-1', delta: ', ' },
        { type: 'text-delta', id: 'text-1', delta: 'world!' },
        { type: 'text-end', id: 'text-1' },
        FINISH_STOP,
      ]),
    );

    const opts = getDefaultOpts(model);
    const result = await executeStepWithRetry(opts);

    expect(result.finishReason).toBe('stop');
    expect(opts.accumulatedParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text-delta',
          text: 'Hello, world!',
        }),
      ]),
    );
  });

  test('handles reasoning stream parts', async () => {
    const model = createMockModel(async () =>
      makeStreamResult([
        { type: 'reasoning-start', id: 'reason-1' },
        { type: 'reasoning-delta', id: 'reason-1', delta: 'Let me think...' },
        { type: 'reasoning-end', id: 'reason-1' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'The answer is 42.' },
        { type: 'text-end', id: 'text-1' },
        FINISH_STOP,
      ]),
    );

    const opts = getDefaultOpts(model);
    const result = await executeStepWithRetry(opts);

    expect(result.finishReason).toBe('stop');
    expect(opts.accumulatedParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'reasoning-delta',
          text: 'Let me think...',
        }),
        expect.objectContaining({
          type: 'text-delta',
          text: 'The answer is 42.',
        }),
      ]),
    );
  });

  test('records tool calls and results from tool execution', async () => {
    const model = createMockModel(async () =>
      makeStreamResult([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'read',
          input: '{"filePath":"README.md"}',
        },
        makeFinish('tool-calls'),
      ]),
    );

    const readTool = tool({
      description: 'Read a file',
      inputSchema: z.object({ filePath: z.string() }),
      execute: async () => ({ content: '# Hello' }),
    });

    const accumulatedParts: StoredPart[] = [];
    const opts = getDefaultOpts(model, {
      accumulatedParts,
      tools: { read: readTool } as unknown as StepOptions['tools'],
    });
    const result = await executeStepWithRetry(opts);

    expect(result.finishReason).toBe('tool-calls');
    expect(result.toolCalls).toEqual(
      expect.arrayContaining([expect.objectContaining({ toolName: 'read' })]),
    );

    const toolCallPart = accumulatedParts.find((p) => p.type === 'tool-call');
    expect(toolCallPart).toBeDefined();

    const toolResultPart = accumulatedParts.find((p) => p.type === 'tool-result');
    expect(toolResultPart).toBeDefined();
  });

  test('collects tool error and propagates permission rejection', async () => {
    const model = createMockModel(async () =>
      makeStreamResult([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'webfetch',
          input: '{"url":"https://example.com"}',
        },
        makeFinish('tool-calls'),
      ]),
    );

    const failingTool = tool({
      description: 'Fetch a URL',
      inputSchema: z.object({ url: z.string() }),
      execute: async (): Promise<string> => {
        throw new PermissionRejectedError('webfetch');
      },
    });

    const accumulatedParts: StoredPart[] = [];
    const opts = getDefaultOpts(model, {
      accumulatedParts,
      tools: { webfetch: failingTool } as unknown as StepOptions['tools'],
    });

    await expect(executeStepWithRetry(opts)).rejects.toBeInstanceOf(PermissionRejectedError);

    const errorResult = accumulatedParts.find(
      (p): p is StoredPart & { type: 'tool-result' } =>
        p.type === 'tool-result' && p.toolName === 'webfetch',
    );
    expect(errorResult).toBeDefined();
  });

  test('suppresses retry when step fails after tool side effects', async () => {
    let callCount = 0;
    const model = createMockModel(async () => {
      callCount++;
      return makeStreamResult([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'bash',
          input: '{"command":"pwd"}',
        },
        { type: 'error', error: new Error('provider stream failed after tool call') },
      ]);
    });

    const bashTool = tool({
      description: 'Run a command',
      inputSchema: z.object({ command: z.string() }),
      execute: async () => ({ output: '/home/user' }),
    });

    const accumulatedParts: StoredPart[] = [];
    const opts = getDefaultOpts(model, {
      accumulatedParts,
      tools: { bash: bashTool } as unknown as StepOptions['tools'],
    });

    const result = await executeStepWithRetry(opts);

    expect(callCount).toBe(1);
    expect(result.finishReason).toBe('tool-calls');
    expect(result.toolCalls).toEqual(
      expect.arrayContaining([expect.objectContaining({ toolName: 'bash' })]),
    );
  });

  test('broadcasts SSE events during streaming', async () => {
    const model = createMockModel(async () =>
      makeStreamResult([
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hi' },
        { type: 'text-end', id: 'text-1' },
        FINISH_STOP,
      ]),
    );

    const opts = getDefaultOpts(model);
    await executeStepWithRetry(opts);

    const eventTypes = broadcastMock.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(eventTypes).toContain('stream-part-update');
    expect(eventTypes).toContain('stream-part-delta');
  });

  test('handles abort signal during streaming', async () => {
    const abortController = new AbortController();
    abortController.abort();

    const model = createMockModel(async () =>
      makeStreamResult([
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Starting...' },
        FINISH_STOP,
      ]),
    );

    const opts = getDefaultOpts(model, {
      abortSignal: abortController.signal,
    });

    await expect(executeStepWithRetry(opts)).rejects.toBeInstanceOf(StreamAbortedError);
  });
});
