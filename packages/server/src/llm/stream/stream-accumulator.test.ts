import { beforeEach, describe, expect, test } from 'bun:test';

import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import { internalBus } from '@/lib/internal-bus.js';
import type { InternalEventMap, InternalEventName } from '@/lib/internal-bus.js';
import type { ToolCallRecord } from '@/llm/stream/doom-loop.js';
import { PermissionRejectedError, StreamAbortedError, StreamPartError } from '@/llm/stream/errors.js';
import { StreamAccumulator } from '@/llm/stream/stream-accumulator.js';
import type { TextStreamPart, ToolSet } from 'ai';

type EmittedEvent = [InternalEventName, InternalEventMap[InternalEventName]];
let emittedEvents: EmittedEvent[] = [];
let cleanups: Array<() => void> = [];

function captureEvents(...names: InternalEventName[]): void {
  for (const name of names) {
    cleanups.push(internalBus.onSync(name, (data) => emittedEvents.push([name, data])));
  }
}

function getEmittedCalls(eventType: string): unknown[] {
  return emittedEvents.filter(([name]) => name === eventType).map(([, data]) => data);
}

function createAccumulator(accumulatedParts?: StoredPart[], toolCalls?: ToolCallRecord[]): StreamAccumulator {
  return new StreamAccumulator(
    'ses_1' as PrefixedString<'ses'>,
    'msg_1' as PrefixedString<'msg'>,
    0,
    accumulatedParts ?? [],
    toolCalls ?? [],
    'run_1',
  );
}

/** Minimal valid part factory helpers — only include fields our code actually reads */
function part<T extends TextStreamPart<ToolSet>>(p: T): T {
  return p;
}

describe('StreamAccumulator', () => {
  beforeEach(() => {
    emittedEvents = [];
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
    captureEvents(
      'part.update',
      'part.delta',
      'tool.pending',
      'tool.started',
      'tool.completed',
      'tool.failed',
      'stream.failed',
    );
  });

  // ─── Text accumulation ──────────────────────────────────────────────

  describe('text accumulation', () => {
    test('accumulates text-start → text-delta → text-end into a stored part', () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      acc.handlePart(part({ type: 'text-start', id: 'id1' }));
      acc.handlePart(part({ type: 'text-delta', id: 'id1', text: 'Hello' }));
      acc.handlePart(part({ type: 'text-delta', id: 'id1', text: ', world!' }));
      acc.handlePart(part({ type: 'text-end', id: 'id1' }));

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({ type: 'text-delta', text: 'Hello, world!' });
    });

    test('flush() emits buffered text when no text-end arrives', () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      acc.handlePart(part({ type: 'text-start', id: 'id1' }));
      acc.handlePart(part({ type: 'text-delta', id: 'id1', text: 'Incomplete' }));
      acc.flush();

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({ type: 'text-delta', text: 'Incomplete' });
    });

    test('flush() does nothing when text buffer is empty', () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      acc.handlePart(part({ type: 'text-start', id: 'id1' }));
      acc.flush();

      expect(parts).toHaveLength(0);
    });

    test('text-delta without text-start increments protocol violation count', () => {
      const acc = createAccumulator();

      acc.handlePart(part({ type: 'text-delta', id: 'id1', text: 'orphan delta' }));

      expect(acc.getProtocolViolationCount()).toBe(1);
    });
  });

  // ─── Reasoning accumulation ─────────────────────────────────────────

  describe('reasoning accumulation', () => {
    test('accumulates reasoning into a stored reasoning-delta part', () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      acc.handlePart(part({ type: 'reasoning-start', id: 'id1' }));
      acc.handlePart(part({ type: 'reasoning-delta', id: 'id1', text: 'Thinking step 1' }));
      acc.handlePart(part({ type: 'reasoning-delta', id: 'id1', text: '. Thinking step 2' }));
      acc.handlePart(part({ type: 'reasoning-end', id: 'id1' }));

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({ type: 'reasoning-delta', text: 'Thinking step 1. Thinking step 2' });
    });

    test('reasoning-delta without reasoning-start increments protocol violation', () => {
      const acc = createAccumulator();

      acc.handlePart(part({ type: 'reasoning-delta', id: 'id1', text: 'orphan' }));

      expect(acc.getProtocolViolationCount()).toBe(1);
    });

    test('flush() emits buffered reasoning when no reasoning-end arrives', () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      acc.handlePart(part({ type: 'reasoning-start', id: 'id1' }));
      acc.handlePart(part({ type: 'reasoning-delta', id: 'id1', text: 'Partial reasoning' }));
      acc.flush();

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({ type: 'reasoning-delta', text: 'Partial reasoning' });
    });
  });

  // ─── Tool call handling ─────────────────────────────────────────────

  describe('tool calls', () => {
    test('records tool-call in both accumulatedParts and toolCalls', () => {
      const parts: StoredPart[] = [];
      const toolCalls: ToolCallRecord[] = [];
      const acc = createAccumulator(parts, toolCalls);

      acc.handlePart(part({ type: 'tool-call', toolCallId: 'call_1', toolName: 'bash', input: { command: 'pwd' } }));

      expect(toolCalls).toEqual([expect.objectContaining({ toolName: 'bash' })]);
      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({ type: 'tool-call', toolCallId: 'call_1', toolName: 'bash' });
    });

    test('records tool-result in accumulatedParts', () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      acc.handlePart(
        part({
          type: 'tool-result',
          toolCallId: 'call_1',
          toolName: 'bash',
          input: { command: 'pwd' },
          output: { result: '/home/user' },
        }),
      );

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'bash',
        output: { result: '/home/user' },
        truncated: false,
      });
    });

    test('broadcasts tool.started and tool.completed for tool-call and tool-result lifecycle', () => {
      const acc = createAccumulator();

      acc.handlePart(
        part({ type: 'tool-call', toolCallId: 'call_1', toolName: 'read', input: { filePath: 'README.md' } }),
      );
      acc.handlePart(
        part({
          type: 'tool-result',
          toolCallId: 'call_1',
          toolName: 'read',
          input: { filePath: 'README.md' },
          output: { content: '# Hello' },
        }),
      );

      const startedCalls = getEmittedCalls('tool.started');
      const completedCalls = getEmittedCalls('tool.completed');

      expect(startedCalls).toHaveLength(1);
      expect(completedCalls).toHaveLength(1);
      expect(startedCalls[0]).toMatchObject({ toolName: 'read' });
      expect(completedCalls[0]).toMatchObject({ toolName: 'read' });
    });

    test('broadcasts tool.failed when a tool-result contains an error payload', () => {
      const acc = createAccumulator();

      acc.handlePart(
        part({
          type: 'tool-result',
          toolCallId: 'call_1',
          toolName: 'browser',
          input: { action: 'snapshot' },
          output: { error: 'Navigation failed' },
        }),
      );

      const failedCalls = getEmittedCalls('tool.failed');
      expect(failedCalls).toHaveLength(1);
      expect(failedCalls[0]).toMatchObject({ toolName: 'browser', error: 'Navigation failed' });
    });

    test('broadcasts tool.pending for tool-input-start', () => {
      const acc = createAccumulator();

      acc.handlePart(part({ type: 'tool-input-start', id: 'call_1', toolName: 'bash' }));

      const pendingCalls = getEmittedCalls('tool.pending');
      expect(pendingCalls).toHaveLength(1);
      expect(pendingCalls[0]).toMatchObject({ toolName: 'bash' });
    });
  });

  // ─── Tool error handling ────────────────────────────────────────────

  describe('tool errors', () => {
    test('converts tool-error to tool-result with error output', () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      acc.handlePart(
        part({
          type: 'tool-error',
          toolCallId: 'call_1',
          toolName: 'webfetch',
          input: {},
          error: 'connection refused',
        }),
      );

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'webfetch',
        output: { error: 'connection refused' },
      });
    });

    test('captures PermissionRejectedError from tool-error', () => {
      const acc = createAccumulator();
      const permError = new PermissionRejectedError('webfetch');

      acc.handlePart(
        part({ type: 'tool-error', toolCallId: 'call_1', toolName: 'webfetch', input: {}, error: permError }),
      );

      expect(acc.getPermissionRejected()).toBeInstanceOf(PermissionRejectedError);
    });

    test('does not set permissionRejected for non-permission errors', () => {
      const acc = createAccumulator();

      acc.handlePart(
        part({
          type: 'tool-error',
          toolCallId: 'call_1',
          toolName: 'bash',
          input: {},
          error: new Error('command failed'),
        }),
      );

      expect(acc.getPermissionRejected()).toBeNull();
    });

    test('broadcasts tool.failed for tool errors', () => {
      const acc = createAccumulator();

      acc.handlePart(
        part({ type: 'tool-error', toolCallId: 'call_1', toolName: 'bash', input: {}, error: 'something went wrong' }),
      );

      const failedCalls = getEmittedCalls('tool.failed');
      expect(failedCalls).toHaveLength(1);
      expect(failedCalls[0]).toMatchObject({ toolName: 'bash' });
    });
  });

  // ─── Error parts ────────────────────────────────────────────────────

  describe('error parts', () => {
    test('throws StreamPartError for error parts with Error cause', () => {
      const acc = createAccumulator();

      expect(() => acc.handlePart(part({ type: 'error', error: new Error('stream broke') }))).toThrow(StreamPartError);
    });

    test('throws StreamPartError for non-Error error parts', () => {
      const acc = createAccumulator();

      expect(() => acc.handlePart(part({ type: 'error', error: 'string error message' }))).toThrow(StreamPartError);
    });

    test('broadcasts stream.failed for error parts', () => {
      const acc = createAccumulator();

      try {
        acc.handlePart(part({ type: 'error', error: new Error('provider error') }));
      } catch {
        // expected to throw
      }

      const errorCalls = getEmittedCalls('stream.failed');
      expect(errorCalls).toHaveLength(1);
      expect(errorCalls[0]).toMatchObject({ sessionId: 'ses_1', messageId: 'msg_1' });
    });
  });

  // ─── Abort handling ─────────────────────────────────────────────────

  describe('abort handling', () => {
    test('throws StreamAbortedError on abort part', () => {
      const acc = createAccumulator();

      expect(() => acc.handlePart(part({ type: 'abort' }))).toThrow(StreamAbortedError);
    });
  });

  // ─── Source and file parts ──────────────────────────────────────────

  describe('source and file parts', () => {
    test('stores source parts', () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      acc.handlePart(
        part({ type: 'source', sourceType: 'url', id: 'src_1', url: 'https://example.com', title: 'Example' }),
      );

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({ type: 'source', url: 'https://example.com' });
    });

    test('stores file parts', () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      acc.handlePart(
        part({ type: 'file', file: { uint8Array: new Uint8Array(), mediaType: 'image/png', base64: '' } as any }),
      );

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({ type: 'file' });
    });
  });

  // ─── Ignored/passthrough parts ──────────────────────────────────────

  describe('passthrough parts', () => {
    test('silently ignores start-step and finish-step parts', () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      acc.handlePart(part({ type: 'start-step', request: {} as any, warnings: [] }));
      acc.handlePart(
        part({
          type: 'finish-step',
          response: {} as any,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            inputTokenDetails: {},
            outputTokenDetails: {},
          } as any,
          finishReason: 'stop',
          rawFinishReason: 'stop',
          providerMetadata: undefined,
        }),
      );
      acc.handlePart(part({ type: 'start' }));
      acc.handlePart(part({ type: 'raw', rawValue: {} }));

      expect(parts).toHaveLength(0);
      expect(acc.getProtocolViolationCount()).toBe(0);
    });

    test('tool-input-delta and tool-input-end do not create stored parts', () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      acc.handlePart(part({ type: 'tool-input-delta', id: 'call_1', delta: '{}' }));
      acc.handlePart(part({ type: 'tool-input-end', id: 'call_1' }));

      expect(parts).toHaveLength(0);
    });
  });

  // ─── SSE broadcasting ──────────────────────────────────────────────

  describe('SSE broadcasting', () => {
    test('broadcasts stream-part-update on text-start and text-end', () => {
      const acc = createAccumulator();

      acc.handlePart(part({ type: 'text-start', id: 'id1' }));
      acc.handlePart(part({ type: 'text-delta', id: 'id1', text: 'Hi' }));
      acc.handlePart(part({ type: 'text-end', id: 'id1' }));

      const updateCalls = getEmittedCalls('part.update');
      expect(updateCalls).toHaveLength(2);
    });

    test('broadcasts stream-part-delta for each text-delta', () => {
      const acc = createAccumulator();

      acc.handlePart(part({ type: 'text-start', id: 'id1' }));
      acc.handlePart(part({ type: 'text-delta', id: 'id1', text: 'A' }));
      acc.handlePart(part({ type: 'text-delta', id: 'id1', text: 'B' }));

      const deltaCalls = getEmittedCalls('part.delta');
      expect(deltaCalls).toHaveLength(2);
    });

    test('flush() broadcasts text-end signal for buffered text parts', () => {
      const acc = createAccumulator();

      acc.handlePart(part({ type: 'text-start', id: 'id1' }));
      acc.handlePart(part({ type: 'text-delta', id: 'id1', text: 'Partial' }));
      acc.flush();

      const updateCalls = getEmittedCalls('part.update');
      // text-start + text-end (from flush)
      expect(updateCalls).toHaveLength(2);
      expect(updateCalls[1]).toMatchObject({ part: { type: 'text-end' } });
    });

    test('flush() broadcasts reasoning-end signal for buffered reasoning parts', () => {
      const acc = createAccumulator();

      acc.handlePart(part({ type: 'reasoning-start', id: 'id1' }));
      acc.handlePart(part({ type: 'reasoning-delta', id: 'id1', text: 'Thinking' }));
      acc.flush();

      const updateCalls = getEmittedCalls('part.update');
      // reasoning-start + reasoning-end (from flush)
      expect(updateCalls).toHaveLength(2);
      expect(updateCalls[1]).toMatchObject({ part: { type: 'reasoning-end' } });
    });
  });

  // ─── Mixed content ─────────────────────────────────────────────────

  describe('mixed content', () => {
    test('handles interleaved reasoning + text + tool calls', () => {
      const parts: StoredPart[] = [];
      const toolCalls: ToolCallRecord[] = [];
      const acc = createAccumulator(parts, toolCalls);

      acc.handlePart(part({ type: 'reasoning-start', id: 'id1' }));
      acc.handlePart(part({ type: 'reasoning-delta', id: 'id1', text: 'Analyzing...' }));
      acc.handlePart(part({ type: 'reasoning-end', id: 'id1' }));
      acc.handlePart(part({ type: 'text-start', id: 'id2' }));
      acc.handlePart(part({ type: 'text-delta', id: 'id2', text: 'Let me check.' }));
      acc.handlePart(part({ type: 'text-end', id: 'id2' }));
      acc.handlePart(part({ type: 'tool-call', toolCallId: 'call_1', toolName: 'bash', input: { command: 'ls' } }));
      acc.handlePart(
        part({
          type: 'tool-result',
          toolCallId: 'call_1',
          toolName: 'bash',
          input: { command: 'ls' },
          output: { files: ['a.ts', 'b.ts'] },
        }),
      );

      expect(parts).toHaveLength(4);
      expect(parts[0]).toMatchObject({ type: 'reasoning-delta', text: 'Analyzing...' });
      expect(parts[1]).toMatchObject({ type: 'text-delta', text: 'Let me check.' });
      expect(parts[2]).toMatchObject({ type: 'tool-call', toolName: 'bash' });
      expect(parts[3]).toMatchObject({ type: 'tool-result', toolName: 'bash' });
      expect(toolCalls).toHaveLength(1);
    });
  });
});
