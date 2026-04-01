import { describe, expect, test, vi } from 'vitest';

import type { PrefixedString } from '@stitch/shared/id';

const mocks = vi.hoisted(() => {
  const createSessionMock = vi.fn();
  const runStreamMock = vi.fn();
  const broadcastMock = vi.fn();
  const buildCompactedHistoryMock = vi.fn();
  const registerMock = vi.fn();
  const cleanupMock = vi.fn();
  const abortMock = vi.fn();
  const valuesMock = vi.fn();
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const whereMock = vi.fn();
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const getDbMock = vi.fn(() => ({
    insert: insertMock,
    select: selectMock,
  }));

  return {
    createSessionMock,
    runStreamMock,
    broadcastMock,
    buildCompactedHistoryMock,
    registerMock,
    cleanupMock,
    abortMock,
    valuesMock,
    insertMock,
    whereMock,
    fromMock,
    selectMock,
    getDbMock,
  };
});

vi.mock('@/chat/service.js', () => ({
  createSession: mocks.createSessionMock,
}));

vi.mock('@/llm/stream/runner.js', () => ({
  runStream: mocks.runStreamMock,
}));

vi.mock('@/lib/sse.js', () => ({
  broadcast: mocks.broadcastMock,
}));

vi.mock('@/llm/compaction.js', () => ({
  buildCompactedHistory: mocks.buildCompactedHistoryMock,
}));

vi.mock('@/lib/abort-registry.js', () => ({
  register: mocks.registerMock,
  cleanup: mocks.cleanupMock,
  abort: mocks.abortMock,
}));

vi.mock('@/db/client.js', () => ({
  getDb: mocks.getDbMock,
}));

describe('task tool', () => {
  test('broadcasts child session id before child stream completes', async () => {
    const { createTaskTool } = await import('@/tools/core/task.js');

    const childSessionId = 'ses_child' as PrefixedString<'ses'>;
    const parentSessionId = 'ses_parent' as PrefixedString<'ses'>;
    const messageId = 'msg_parent' as PrefixedString<'msg'>;

    mocks.createSessionMock.mockResolvedValue({
      id: childSessionId,
      title: 'Investigate bug',
    });
    mocks.broadcastMock.mockResolvedValue(undefined);
    mocks.valuesMock.mockResolvedValue(undefined);
    mocks.buildCompactedHistoryMock.mockResolvedValue([]);
    mocks.registerMock.mockReturnValue(new AbortController().signal);
    mocks.runStreamMock.mockResolvedValue(undefined);
    mocks.whereMock.mockResolvedValue([
      {
        parts: [
          {
            type: 'text-delta',
            text: 'Done',
          },
        ],
      },
    ]);

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
        task: 'Investigate a flaky test',
      },
      {
        toolCallId: 'call_task_1',
      } as never,
    );

    expect(mocks.broadcastMock).toHaveBeenCalledWith('stream-tool-state', {
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

    const broadcastCallOrder = mocks.broadcastMock.mock.invocationCallOrder[0];
    const runStreamCallOrder = mocks.runStreamMock.mock.invocationCallOrder[0];
    expect(broadcastCallOrder).toBeLessThan(runStreamCallOrder);
  });
});
