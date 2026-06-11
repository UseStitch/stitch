import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ToolCallStatus } from '@stitch/shared/chat/stream-events';

import { StreamingMessageBubble } from './streaming-message-bubble.js';

import type { StreamingPart } from '@/stores/stream-store';

const DASHBOARD_SPEC = {
  root: 'n1',
  nodes: [
    { id: 'n1', component: 'Stat', label: 'Revenue', value: '$4.2k', caption: null, trend: 'up' },
  ],
};

function toolCallPart(overrides: Partial<Extract<StreamingPart, { type: 'tool-call' }>>) {
  return {
    type: 'tool-call' as const,
    toolCallId: 'tc1',
    toolName: 'render_ui',
    input: DASHBOARD_SPEC,
    status: 'completed' as ToolCallStatus,
    output: null,
    error: null,
    startedAt: 0,
    endedAt: 1,
    ...overrides,
  };
}

function textPart(text: string, id: string): StreamingPart {
  return {
    type: 'text',
    id,
    text,
    hasContent: true,
    status: 'complete',
    startedAt: 0,
    endedAt: 1,
  };
}

describe('StreamingMessageBubble liquid UI', () => {
  test('renders render_ui tool-call as inline dashboard while streaming', () => {
    const html = renderToStaticMarkup(
      <StreamingMessageBubble partIds={['tc1']} parts={{ tc1: toolCallPart({}) }} />,
    );

    expect(html).toContain('Revenue');
    expect(html).toContain('$4.2k');
  });

  test('renders dashboard after preceding text in stream order', () => {
    const html = renderToStaticMarkup(
      <StreamingMessageBubble
        partIds={['t1', 'tc1']}
        parts={{ t1: textPart('Here is the summary', 't1'), tc1: toolCallPart({}) }}
      />,
    );

    expect(html.indexOf('Here is the summary')).toBeLessThan(html.indexOf('Revenue'));
  });

  test('renders nothing for the dashboard when the render_ui call errored', () => {
    const html = renderToStaticMarkup(
      <StreamingMessageBubble
        partIds={['tc1']}
        parts={{ tc1: toolCallPart({ status: 'error', error: 'rejected' }) }}
      />,
    );

    expect(html).not.toContain('Revenue');
  });
});
