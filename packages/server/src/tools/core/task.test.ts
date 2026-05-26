import { describe, expect, mock, test } from 'bun:test';

import type { PrefixedString } from '@stitch/shared/id';

const createSessionMock = mock();
const runStreamMock = mock();
const broadcastMock = mock();
const buildCompactedHistoryMock = mock();
const registerMock = mock();
const cleanupMock = mock();
const abortMock = mock();
const valuesMock = mock();
const insertMock = mock(() => ({ values: valuesMock }));
const whereMock = mock();
const fromMock = mock(() => ({ where: whereMock }));
const selectMock = mock(() => ({ from: fromMock }));
const getDbMock = mock(() => ({
  insert: insertMock,
  select: selectMock,
}));

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

mock.module('@/db/client.js', () => ({
  getDb: getDbMock,
}));

describe('task tool', () => {
  test('broadcasts child session id before child stream completes', async () => {
    const { createTaskTool } = await import('@/tools/core/task.js');

    const childSessionId = 'ses_child' as PrefixedString<'ses'>;
    const parentSessionId = 'ses_parent' as PrefixedString<'ses'>;
    const messageId = 'msg_parent' as PrefixedString<'msg'>;

    createSessionMock.mockResolvedValue({
      data: {
        id: childSessionId,
        title: 'Investigate bug',
      },
    });
    broadcastMock.mockResolvedValue(undefined);
    valuesMock.mockResolvedValue(undefined);
    buildCompactedHistoryMock.mockResolvedValue([]);
    registerMock.mockReturnValue(new AbortController().signal);
    runStreamMock.mockResolvedValue(undefined);
    whereMock.mockResolvedValue([
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
