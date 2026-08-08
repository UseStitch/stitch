import { beforeEach, describe, expect, test } from 'bun:test';

import { useStreamStore } from './stream-store.js';

describe('stream store tool state', () => {
  beforeEach(() => {
    useStreamStore.setState({ sessions: {} });
  });

  test('adds and updates a tool call from streamed lifecycle events', () => {
    const { applyStreamStart, applyToolState } = useStreamStore.getState();

    applyStreamStart('ses_test', 'msg_test');
    applyToolState('ses_test', 'msg_test', 'tool_test', 'bash', 'pending');

    expect(useStreamStore.getState().sessions.ses_test.parts.tool_test).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tool_test',
      toolName: 'bash',
      status: 'pending',
    });

    applyToolState('ses_test', 'msg_test', 'tool_test', 'bash', 'in-progress', { command: 'pwd' });

    expect(useStreamStore.getState().sessions.ses_test.parts.tool_test).toMatchObject({
      status: 'in-progress',
      input: { command: 'pwd' },
    });
  });
});
