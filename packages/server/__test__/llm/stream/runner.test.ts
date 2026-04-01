import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { runStream } from '@/llm/stream/runner.js';
import type { ProviderCredentials } from '@/provider/provider.js';

const CREDENTIALS: ProviderCredentials = {
  providerId: 'openai',
  auth: { method: 'api-key', apiKey: 'test-key' },
};

function createTextModel(text: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: null,
        chunkDelayInMs: null,
        chunks: [
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: text },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: undefined },
            usage: {
              inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 4, text: 4, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
}

describe('runStream integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('streams text and persists assistant payload through injected persistence deps', async () => {
    const savedMessages: Array<{ finishReason: string; parts: unknown[] }> = [];
    const broadcastMock = vi.fn(async (..._args: unknown[]) => {});

    await runStream({
      sessionId: 'ses_integration_1' as never,
      assistantMessageId: 'msg_integration_1' as never,
      modelId: 'openai/gpt-5.3-codex',
      llmMessages: [{ role: 'user', content: 'Hello' }],
      credentials: CREDENTIALS,
      abortSignal: new AbortController().signal,
      model: createTextModel('Hello from integration') as never,
      deps: {
        saveAssistantMessage: async ({ accumulatedParts, finalFinishReason }) => {
          savedMessages.push({ finishReason: finalFinishReason, parts: accumulatedParts });
        },
        markSessionUnread: async () => {},
        broadcast: broadcastMock,
        getCompactionSettings: async () => ({ auto: false, prune: false }),
      },
    });

    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0]?.finishReason).toBe('stop');
    expect(savedMessages[0]?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text-delta', text: 'Hello from integration' }),
      ]),
    );

    const events = broadcastMock.mock.calls.map((call) => String(call[0]));
    expect(events).toContain('stream-start');
  });

  test('persists aborted finish reason when abort signal is already aborted', async () => {
    const savedMessages: Array<{ finishReason: string }> = [];
    const controller = new AbortController();
    controller.abort();

    await runStream({
      sessionId: 'ses_integration_2' as never,
      assistantMessageId: 'msg_integration_2' as never,
      modelId: 'openai/gpt-5.3-codex',
      llmMessages: [{ role: 'user', content: 'Hello' }],
      credentials: CREDENTIALS,
      abortSignal: controller.signal,
      model: createTextModel('partial') as never,
      deps: {
        saveAssistantMessage: async ({ finalFinishReason }) => {
          savedMessages.push({ finishReason: finalFinishReason });
        },
        markSessionUnread: async () => {},
        broadcast: async () => {},
        getCompactionSettings: async () => ({ auto: false, prune: false }),
      },
    });

    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0]?.finishReason).toBe('aborted');
  });
});
