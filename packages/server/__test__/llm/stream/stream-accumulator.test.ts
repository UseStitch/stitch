import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import type { ToolCallRecord } from '@/llm/stream/doom-loop.js';
import {
  PermissionRejectedError,
  StreamAbortedError,
  StreamPartError,
} from '@/llm/stream/errors.js';
import { StreamAccumulator } from '@/llm/stream/stream-accumulator.js';

const broadcastMock = vi.fn(async (..._args: unknown[]) => {});

function getBroadcastCalls(eventType: string): unknown[][] {
  return broadcastMock.mock.calls.filter((call: unknown[]) => call[0] === eventType);
}

function createAccumulator(
  accumulatedParts?: StoredPart[],
  toolCalls?: ToolCallRecord[],
): StreamAccumulator {
  return new StreamAccumulator(
    'ses_1' as PrefixedString<'ses'>,
    'msg_1' as PrefixedString<'msg'>,
    0,
    accumulatedParts ?? [],
    toolCalls ?? [],
    'run_1',
    broadcastMock as never,
  );
}

describe('StreamAccumulator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    broadcastMock.mockResolvedValue(undefined);
  });

  // ─── Text accumulation ──────────────────────────────────────────────

  describe('text accumulation', () => {
    test('accumulates text-start → text-delta → text-end into a stored part', async () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      await acc.handlePart({ type: 'text-start' });
      await acc.handlePart({ type: 'text-delta', text: 'Hello' });
      await acc.handlePart({ type: 'text-delta', text: ', world!' });
      await acc.handlePart({ type: 'text-end' });

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: 'text-delta',
        text: 'Hello, world!',
      });
    });

    test('flush() emits buffered text when no text-end arrives', async () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      await acc.handlePart({ type: 'text-start' });
      await acc.handlePart({ type: 'text-delta', text: 'Incomplete' });
      acc.flush();

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: 'text-delta',
        text: 'Incomplete',
      });
    });

    test('flush() does nothing when text buffer is empty', async () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      await acc.handlePart({ type: 'text-start' });
      acc.flush();

      expect(parts).toHaveLength(0);
    });

    test('text-delta without text-start increments protocol violation count', async () => {
      const acc = createAccumulator();

      await acc.handlePart({ type: 'text-delta', text: 'orphan delta' });

      expect(acc.getProtocolViolationCount()).toBe(1);
    });
  });

  // ─── Reasoning accumulation ─────────────────────────────────────────

  describe('reasoning accumulation', () => {
    test('accumulates reasoning into a stored reasoning-delta part', async () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      await acc.handlePart({ type: 'reasoning-start' });
      await acc.handlePart({ type: 'reasoning-delta', text: 'Thinking step 1' });
      await acc.handlePart({ type: 'reasoning-delta', text: '. Thinking step 2' });
      await acc.handlePart({ type: 'reasoning-end' });

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: 'reasoning-delta',
        text: 'Thinking step 1. Thinking step 2',
      });
    });

    test('reasoning-delta without reasoning-start increments protocol violation', async () => {
      const acc = createAccumulator();

      await acc.handlePart({ type: 'reasoning-delta', text: 'orphan' });

      expect(acc.getProtocolViolationCount()).toBe(1);
    });

    test('flush() emits buffered reasoning when no reasoning-end arrives', async () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      await acc.handlePart({ type: 'reasoning-start' });
      await acc.handlePart({ type: 'reasoning-delta', text: 'Partial reasoning' });
      acc.flush();

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: 'reasoning-delta',
        text: 'Partial reasoning',
      });
    });
  });

  // ─── Tool call handling ─────────────────────────────────────────────

  describe('tool calls', () => {
    test('records tool-call in both accumulatedParts and toolCalls', async () => {
      const parts: StoredPart[] = [];
      const toolCalls: ToolCallRecord[] = [];
      const acc = createAccumulator(parts, toolCalls);

      await acc.handlePart({
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'bash',
        input: { command: 'pwd' },
      });

      expect(toolCalls).toEqual([expect.objectContaining({ toolName: 'bash' })]);
      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'bash',
      });
    });

    test('records tool-result in accumulatedParts', async () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      await acc.handlePart({
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'bash',
        input: { command: 'pwd' },
        output: { result: '/home/user' },
      });

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'bash',
        output: { result: '/home/user' },
        truncated: false,
      });
    });

    test('broadcasts stream-tool-state for tool-call and tool-result lifecycle', async () => {
      const acc = createAccumulator();

      await acc.handlePart({
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'read',
        input: { filePath: 'README.md' },
      });
      await acc.handlePart({
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'read',
        input: { filePath: 'README.md' },
        output: { content: '# Hello' },
      });

      const toolStateCalls = getBroadcastCalls('stream-tool-state');

      expect(toolStateCalls).toHaveLength(2);
      expect(toolStateCalls[0][1]).toMatchObject({ status: 'in-progress' });
      expect(toolStateCalls[1][1]).toMatchObject({ status: 'completed' });
    });

    test('broadcasts stream-tool-state pending for tool-input-start', async () => {
      const acc = createAccumulator();

      await acc.handlePart({
        type: 'tool-input-start',
        id: 'call_1',
        toolName: 'bash',
      });

      const toolStateCalls = getBroadcastCalls('stream-tool-state');
      expect(toolStateCalls).toHaveLength(1);
      expect(toolStateCalls[0][1]).toMatchObject({ status: 'pending', toolName: 'bash' });
    });
  });

  // ─── Tool error handling ────────────────────────────────────────────

  describe('tool errors', () => {
    test('converts tool-error to tool-result with error output', async () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      await acc.handlePart({
        type: 'tool-error',
        toolCallId: 'call_1',
        toolName: 'webfetch',
        error: 'connection refused',
      });

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'webfetch',
        output: { error: 'connection refused' },
      });
    });

    test('captures PermissionRejectedError from tool-error', async () => {
      const acc = createAccumulator();
      const permError = new PermissionRejectedError('webfetch');

      await acc.handlePart({
        type: 'tool-error',
        toolCallId: 'call_1',
        toolName: 'webfetch',
        error: permError,
      });

      expect(acc.getPermissionRejected()).toBeInstanceOf(PermissionRejectedError);
    });

    test('does not set permissionRejected for non-permission errors', async () => {
      const acc = createAccumulator();

      await acc.handlePart({
        type: 'tool-error',
        toolCallId: 'call_1',
        toolName: 'bash',
        error: new Error('command failed'),
      });

      expect(acc.getPermissionRejected()).toBeNull();
    });

    test('broadcasts error status for tool errors', async () => {
      const acc = createAccumulator();

      await acc.handlePart({
        type: 'tool-error',
        toolCallId: 'call_1',
        toolName: 'bash',
        error: 'something went wrong',
      });

      const toolStateCalls = getBroadcastCalls('stream-tool-state');
      expect(toolStateCalls).toHaveLength(1);
      expect(toolStateCalls[0][1]).toMatchObject({
        status: 'error',
        toolName: 'bash',
      });
    });
  });

  // ─── Error parts ────────────────────────────────────────────────────

  describe('error parts', () => {
    test('throws StreamPartError for error parts with Error cause', async () => {
      const acc = createAccumulator();

      await expect(
        acc.handlePart({
          type: 'error',
          error: new Error('stream broke'),
        }),
      ).rejects.toBeInstanceOf(StreamPartError);
    });

    test('throws StreamPartError for non-Error error parts', async () => {
      const acc = createAccumulator();

      await expect(
        acc.handlePart({
          type: 'error',
          error: 'string error message',
        }),
      ).rejects.toBeInstanceOf(StreamPartError);
    });

    test('broadcasts stream-error for error parts', async () => {
      const acc = createAccumulator();

      try {
        await acc.handlePart({
          type: 'error',
          error: new Error('provider error'),
        });
      } catch {
        // expected to throw
      }

      const errorCalls = getBroadcastCalls('stream-error');
      expect(errorCalls).toHaveLength(1);
      expect(errorCalls[0][1]).toMatchObject({
        sessionId: 'ses_1',
        messageId: 'msg_1',
      });
    });
  });

  // ─── Abort handling ─────────────────────────────────────────────────

  describe('abort handling', () => {
    test('throws StreamAbortedError on abort part', async () => {
      const acc = createAccumulator();

      await expect(acc.handlePart({ type: 'abort' })).rejects.toBeInstanceOf(StreamAbortedError);
    });
  });

  // ─── Source and file parts ──────────────────────────────────────────

  describe('source and file parts', () => {
    test('stores source parts', async () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      await acc.handlePart({
        type: 'source',
        sourceType: 'url',
        url: 'https://example.com',
        title: 'Example',
      });

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: 'source',
        url: 'https://example.com',
      });
    });

    test('stores file parts', async () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      await acc.handlePart({
        type: 'file',
        data: 'base64data',
        mediaType: 'image/png',
      });

      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({
        type: 'file',
        mediaType: 'image/png',
      });
    });
  });

  // ─── Ignored/passthrough parts ──────────────────────────────────────

  describe('passthrough parts', () => {
    test('silently ignores start-step and finish-step parts', async () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      await acc.handlePart({ type: 'start-step' });
      await acc.handlePart({ type: 'finish-step' });
      await acc.handlePart({ type: 'start' });
      await acc.handlePart({ type: 'raw', rawValue: {} });

      expect(parts).toHaveLength(0);
      expect(acc.getProtocolViolationCount()).toBe(0);
    });

    test('tool-input-delta and tool-input-end do not create stored parts', async () => {
      const parts: StoredPart[] = [];
      const acc = createAccumulator(parts);

      await acc.handlePart({ type: 'tool-input-delta', id: 'call_1', delta: '{}' });
      await acc.handlePart({ type: 'tool-input-end', id: 'call_1' });

      expect(parts).toHaveLength(0);
    });
  });

  // ─── SSE broadcasting ──────────────────────────────────────────────

  describe('SSE broadcasting', () => {
    test('broadcasts stream-part-update on text-start and text-end', async () => {
      const acc = createAccumulator();

      await acc.handlePart({ type: 'text-start' });
      await acc.handlePart({ type: 'text-delta', text: 'Hi' });
      await acc.handlePart({ type: 'text-end' });

      const updateCalls = getBroadcastCalls('stream-part-update');
      expect(updateCalls).toHaveLength(2);
    });

    test('broadcasts stream-part-delta for each text-delta', async () => {
      const acc = createAccumulator();

      await acc.handlePart({ type: 'text-start' });
      await acc.handlePart({ type: 'text-delta', text: 'A' });
      await acc.handlePart({ type: 'text-delta', text: 'B' });

      const deltaCalls = getBroadcastCalls('stream-part-delta');
      expect(deltaCalls).toHaveLength(2);
    });
  });

  // ─── Mixed content ─────────────────────────────────────────────────

  describe('mixed content', () => {
    test('handles interleaved reasoning + text + tool calls', async () => {
      const parts: StoredPart[] = [];
      const toolCalls: ToolCallRecord[] = [];
      const acc = createAccumulator(parts, toolCalls);

      await acc.handlePart({ type: 'reasoning-start' });
      await acc.handlePart({ type: 'reasoning-delta', text: 'Analyzing...' });
      await acc.handlePart({ type: 'reasoning-end' });
      await acc.handlePart({ type: 'text-start' });
      await acc.handlePart({ type: 'text-delta', text: 'Let me check.' });
      await acc.handlePart({ type: 'text-end' });
      await acc.handlePart({
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'bash',
        input: { command: 'ls' },
      });
      await acc.handlePart({
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'bash',
        input: { command: 'ls' },
        output: { files: ['a.ts', 'b.ts'] },
      });

      expect(parts).toHaveLength(4);
      expect(parts[0]).toMatchObject({ type: 'reasoning-delta', text: 'Analyzing...' });
      expect(parts[1]).toMatchObject({ type: 'text-delta', text: 'Let me check.' });
      expect(parts[2]).toMatchObject({ type: 'tool-call', toolName: 'bash' });
      expect(parts[3]).toMatchObject({ type: 'tool-result', toolName: 'bash' });
      expect(toolCalls).toHaveLength(1);
    });
  });
});
