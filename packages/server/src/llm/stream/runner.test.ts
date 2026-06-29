import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, test } from 'bun:test';

import { setupTestDb } from '@/db/test-helpers.js';
import { internalBus } from '@/lib/internal-bus.js';
import type { InternalEventMap, InternalEventName } from '@/lib/internal-bus.js';
import type { ProviderCredentials } from '@/llm/provider/provider.js';
import { runStream } from '@/llm/stream/runner.js';

type EmittedEvent = [InternalEventName, InternalEventMap[InternalEventName]];
let emittedEvents: EmittedEvent[] = [];
let cleanups: Array<() => void> = [];

function captureAllEvents(): void {
  const names: InternalEventName[] = [
    'stream.started',
    'stream.completed',
    'stream.step.completed',
    'part.update',
    'part.delta',
    'tool.pending',
    'tool.started',
    'tool.completed',
    'tool.failed',
    'stream.failed',
  ];
  for (const name of names) {
    cleanups.push(internalBus.onSync(name, (data) => emittedEvents.push([name, data])));
  }
}

const CREDENTIALS: ProviderCredentials = {
  providerId: 'openai',
  auth: { method: 'api-key', apiKey: 'test-key' },
};

setupTestDb();

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
    emittedEvents = [];
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
    captureAllEvents();
  });

  test('streams text and persists assistant payload through injected persistence deps', async () => {
    const savedMessages: Array<{ finishReason: string; parts: unknown[] }> = [];

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
        getCompactionSettings: async () => ({
          auto: false,
          prune: false,
        }),
        pruneSession: async () => 0,
      },
    });

    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0]?.finishReason).toBe('stop');
    expect(savedMessages[0]?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text-delta', text: 'Hello from integration' }),
      ]),
    );

    const events = emittedEvents.map(([name]) => name);
    expect(events).toContain('stream.started');
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
        getCompactionSettings: async () => ({
          auto: false,
          prune: false,
        }),
        pruneSession: async () => 0,
      },
    });

    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0]?.finishReason).toBe('aborted');
  });
});
