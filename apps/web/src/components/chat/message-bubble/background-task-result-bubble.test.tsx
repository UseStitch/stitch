import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { StoredPart } from '@stitch/shared/chat/messages';

import { MessageBubble } from '../message-bubble.js';

describe('background task result message', () => {
  test('renders a compact marker without user message actions', () => {
    const part: StoredPart = {
      type: 'background-task-result',
      id: 'prt_result',
      startedAt: 1,
      endedAt: 1,
      tasks: [
        { taskId: 'ses_child', childSessionId: 'ses_child', title: 'Task', state: 'completed', text: 'done' },
      ],
    };
    const messageRole = 'user';
    const html = renderToStaticMarkup(
      <MessageBubble role={messageRole} parts={[part]} onEdit={() => undefined} onSplit={() => undefined} />,
    );

    expect(html).toContain('Background task result received');
    expect(html).not.toContain('Edit');
    expect(html).not.toContain('Split');
    expect(html).not.toContain('done');
  });
});
