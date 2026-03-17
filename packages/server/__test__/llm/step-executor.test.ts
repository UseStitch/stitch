import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { StoredPart } from '@openwork/shared';
import { StreamAbortedError } from '@/lib/stream-errors.js';
import { executeStepWithRetry, type StepOptions } from '@/llm/step-executor.js';

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
});
