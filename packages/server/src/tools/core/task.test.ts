import { describe, expect, mock, test } from 'bun:test';

import type { PrefixedString } from '@stitch/shared/id';

const createSessionMock = mock();
const runStreamMock = mock();
const broadcastMock = mock();
const buildCompactedHistoryMock = mock();
const registerMock = mock();
const cleanupMock = mock();
const abortMock = mock();

mock.module('@/chat/service.js', () => ({
  createSession: createSessionMock,
}));

mock.module('@/llm/stream/runner.js', () => ({
  runStream: runStreamMock,
}));

mock.module('@/lib/sse.js', () => ({
  broadcast: broadcastMock,
}));

mock.module('@/llm/compaction.js', () => ({
  buildCompactedHistory: buildCompactedHistoryMock,
}));

mock.module('@/lib/abort-registry.js', () => ({
  register: registerMock,
  cleanup: cleanupMock,
  abort: abortMock,
}));

import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema.js';
import { setupTestDb } from '@/db/test-helpers.js';

setupTestDb();

describe('task tool', () => {
  test('broadcasts child session id before child stream completes', async () => {
    const { createTaskTool } = await import('@/tools/core/task.js');

    const childSessionId = 'ses_child' as PrefixedString<'ses'>;
    const parentSessionId = 'ses_parent' as PrefixedString<'ses'>;
    const messageId = 'msg_parent' as PrefixedString<'msg'>;
    const assistantMessageId = 'msg_assistant' as PrefixedString<'msg'>;

    // Seed parent and child sessions so FK constraints pass
    const db = getDb();
    await db.insert(sessions).values([
      { id: parentSessionId, title: 'Parent', activeToolsetIds: [] },
      { id: childSessionId, title: 'Investigate bug', activeToolsetIds: [] },
    ]);

    createSessionMock.mockResolvedValue({
      data: {
        id: childSessionId,
        title: 'Investigate bug',
      },
    });
    broadcastMock.mockResolvedValue(undefined);
    buildCompactedHistoryMock.mockResolvedValue([]);
    registerMock.mockReturnValue(new AbortController().signal);

    // When runStream completes, seed the assistant message the task tool will read
    runStreamMock.mockImplementation(async (opts: { assistantMessageId: string }) => {
      await db.insert(messages).values({
        id: opts.assistantMessageId as PrefixedString<'msg'>,
        sessionId: childSessionId,
        role: 'assistant',
        parts: [{ type: 'text-delta', text: 'Done' }],
        modelId: 'openai/gpt-5.3-codex',
        providerId: 'openai',
        costUsd: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        startedAt: Date.now(),
        duration: null,
      });
    });

    const taskTool = createTaskTool(
      {
        sessionId: parentSessionId,
        messageId,
        streamRunId: 'run_1',
      },
      {
        parentSessionId,
        parentAbortSignal: new AbortController().signal,
        credentials: { providerId: 'openai', auth: { method: 'api-key', apiKey: 'test' } },
        modelId: 'openai/gpt-5.3-codex',
        providerId: 'openai',
        toolsetManager: {
          getActiveIds: () => new Set<string>(),
        } as never,
      },
    );

    await taskTool.execute?.(
      {
        title: 'Investigate flaky test',
        task: 'Investigate a flaky test',
      },
      {
        toolCallId: 'call_task_1',
      } as never,
    );

    expect(broadcastMock).toHaveBeenCalledWith('stream-tool-state', {
      sessionId: parentSessionId,
      messageId,
      toolCallId: 'call_task_1',
      toolName: 'task',
      status: 'in-progress',
      output: {
        childSessionId,
        childSessionName: 'Investigate bug',
      },
    });

    const broadcastCallOrder = broadcastMock.mock.invocationCallOrder[0];
    const runStreamCallOrder = runStreamMock.mock.invocationCallOrder[0];
    expect(broadcastCallOrder).toBeLessThan(runStreamCallOrder);

    expect(createSessionMock).toHaveBeenCalledWith({
      title: 'Investigate flaky test',
      parentSessionId,
    });
  });
});
