import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { PrefixedString } from '@stitch/shared/id';
import type { SseEventName, SseEventPayloadMap } from '@stitch/shared/realtime';

import { registerSseAdapter, registerSseConnection, unregisterSseConnection } from '@/adapters/sse.js';
import { internalBus } from '@/lib/internal-bus.js';

type CapturedEvent = { event: string; data: string };

function createMockStream() {
  const captured: CapturedEvent[] = [];
  const stream = {
    writeSSE: ({ event, data }: { event: string; data: string }) => {
      captured.push({ event, data });
      return Promise.resolve();
    },
  };
  return { stream, captured } as { stream: Parameters<typeof registerSseConnection>[0]; captured: CapturedEvent[] };
}

function parseCaptured<K extends SseEventName>(captured: CapturedEvent[], eventName: K): SseEventPayloadMap[K][] {
  return captured.filter((c) => c.event === eventName).map((c) => JSON.parse(c.data) as SseEventPayloadMap[K]);
}

describe('sse adapter', () => {
  beforeEach(() => {
    registerSseAdapter();
  });

  afterEach(() => {
    internalBus.clear();
  });

  const sessionId = 'ses_test123' as PrefixedString<'ses'>;
  const messageId = 'msg_test456' as PrefixedString<'msg'>;

  test('forward: narrows internal event to lean SSE payload (stream.started -> stream-start)', () => {
    const { stream, captured } = createMockStream();
    registerSseConnection(stream);

    internalBus.emit('stream.started', {
      sessionId,
      messageId,
      modelId: 'gpt-4o',
      providerId: 'openai',
      streamRunId: 'run_abc',
    });

    const events = parseCaptured(captured, 'stream-start');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ sessionId, messageId });
    // Internal-only fields must NOT leak
    expect(events[0]).not.toHaveProperty('modelId');
    expect(events[0]).not.toHaveProperty('providerId');
    expect(events[0]).not.toHaveProperty('streamRunId');

    unregisterSseConnection(stream);
  });

  test('forward: projects stream-error with error details', () => {
    const { stream, captured } = createMockStream();
    registerSseConnection(stream);

    const details = { category: 'rate_limited' as const, isRetryable: true };

    internalBus.emit('stream.failed', {
      sessionId,
      messageId,
      streamRunId: 'run_x',
      modelId: 'claude',
      providerId: 'anthropic',
      error: 'rate_limit',
      errorCode: '429',
      details,
    });

    const events = parseCaptured(captured, 'stream-error');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ sessionId, messageId, error: 'rate_limit', details });
    expect(events[0]).not.toHaveProperty('streamRunId');
    expect(events[0]).not.toHaveProperty('modelId');

    unregisterSseConnection(stream);
  });

  test('passthrough: forwards identical payload (question.asked -> question-asked)', () => {
    const { stream, captured } = createMockStream();
    registerSseConnection(stream);

    const question = {
      id: 'quest_abc' as PrefixedString<'quest'>,
      sessionId,
      messageId,
      questions: [
        { question: 'Pick a color', header: 'Color', options: [{ label: 'Red', description: 'A warm color' }] },
      ],
      toolCallId: 'tc_q1',
      status: 'pending' as const,
      createdAt: Date.now(),
    };

    internalBus.emit('question.asked', { question });

    const events = parseCaptured(captured, 'question-asked');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ question });

    unregisterSseConnection(stream);
  });

  test('tool lifecycle: maps five internal events to discriminated stream-tool-state', () => {
    const { stream, captured } = createMockStream();
    registerSseConnection(stream);

    const toolCallId = 'tc_1';
    const toolName = 'readFile';

    internalBus.emit('tool.pending', { sessionId, messageId, toolCallId, toolName });
    internalBus.emit('tool.started', { sessionId, messageId, toolCallId, toolName, input: { path: '/a' } });
    internalBus.emit('tool.progress', { sessionId, messageId, toolCallId, toolName, output: 'partial...' });
    internalBus.emit('tool.completed', {
      sessionId,
      messageId,
      toolCallId,
      toolName,
      input: { path: '/a' },
      output: 'done',
    });
    internalBus.emit('tool.failed', { sessionId, messageId, toolCallId, toolName, error: 'ENOENT' });

    const events = parseCaptured(captured, 'stream-tool-state');
    expect(events).toHaveLength(5);

    expect(events[0]).toEqual({ sessionId, messageId, toolCallId, toolName, status: 'pending' });
    expect(events[1]).toEqual({
      sessionId,
      messageId,
      toolCallId,
      toolName,
      status: 'in-progress',
      input: { path: '/a' },
    });
    expect(events[2]).toEqual({
      sessionId,
      messageId,
      toolCallId,
      toolName,
      status: 'in-progress',
      output: 'partial...',
    });
    expect(events[3]).toEqual({
      sessionId,
      messageId,
      toolCallId,
      toolName,
      status: 'completed',
      input: { path: '/a' },
      output: 'done',
    });
    expect(events[4]).toEqual({ sessionId, messageId, toolCallId, toolName, status: 'error', error: 'ENOENT' });

    unregisterSseConnection(stream);
  });

  test('session.message.saved maps to stream-finish', () => {
    const { stream, captured } = createMockStream();
    registerSseConnection(stream);

    const usage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
      outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
    };

    internalBus.emit('session.message.saved', {
      sessionId,
      messageId,
      modelId: 'gpt-4o',
      providerId: 'openai',
      usage,
      costUsd: 0.01,
      finishReason: 'stop',
    });

    const events = parseCaptured(captured, 'stream-finish');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ sessionId, messageId, finishReason: 'stop', usage });
    expect(events[0]).not.toHaveProperty('modelId');
    expect(events[0]).not.toHaveProperty('costUsd');

    unregisterSseConnection(stream);
  });

  test('unregistered connection does not receive events', () => {
    const { stream, captured } = createMockStream();
    registerSseConnection(stream);
    unregisterSseConnection(stream);

    internalBus.emit('stream.started', {
      sessionId,
      messageId,
      modelId: 'gpt-4o',
      providerId: 'openai',
      streamRunId: 'run_abc',
    });

    expect(captured).toHaveLength(0);
  });

  test('passthrough: recording events forwarded identically', () => {
    const { stream, captured } = createMockStream();
    registerSseConnection(stream);

    const recordingId = 'rec_test789' as PrefixedString<'rec'>;
    internalBus.emit('recording.started', { recordingId });
    internalBus.emit('recording.stopped', { recordingId });

    const started = parseCaptured(captured, 'recording-started');
    const stopped = parseCaptured(captured, 'recording-stopped');
    expect(started).toHaveLength(1);
    expect(started[0]).toEqual({ recordingId });
    expect(stopped).toHaveLength(1);
    expect(stopped[0]).toEqual({ recordingId });

    unregisterSseConnection(stream);
  });
});
