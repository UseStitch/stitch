import { describe, expect, test } from 'bun:test';

import {
  compactConversationForStep,
  compactToolResultOutput,
  getToolResultBudget,
} from '@/llm/conversation-compactor.js';
import type { ModelMessage } from 'ai';

describe('conversation compactor', () => {
  test('matches tool budgets by exact name or prefix', () => {
    expect(getToolResultBudget('browser')).toBe(600);
    expect(getToolResultBudget('browser_snapshot')).toBe(600);
    expect(getToolResultBudget('unknown_tool')).toBe(1_000);
  });

  test('compacts oversized tool results while preserving recent results', () => {
    const largeOutput = 'x '.repeat(2_000);
    const conversation: ModelMessage[] = [
      { role: 'user', content: 'Run tools' },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'old',
            toolName: 'browser_snapshot',
            output: { type: 'json', value: largeOutput },
          },
          {
            type: 'tool-result',
            toolCallId: 'new',
            toolName: 'browser_snapshot',
            output: { type: 'json', value: largeOutput },
          },
        ],
      },
    ];

    const compacted = compactConversationForStep(conversation, { preserveRecentToolResults: 1 });
    const toolMessage = compacted[1];

    expect(toolMessage?.role).toBe('tool');
    if (toolMessage?.role !== 'tool' || !Array.isArray(toolMessage.content)) {
      throw new Error('expected tool message content');
    }

    expect(toolMessage.content[0]).toMatchObject({
      output: { value: expect.objectContaining({ summary: expect.stringContaining('compacted') }) },
    });
    expect(toolMessage.content[1]).toMatchObject({ output: { type: 'json', value: largeOutput } });
  });

  test('compacts browser results more aggressively than generic tools', () => {
    const largeOutput = 'browser snapshot '.repeat(2_000);
    const conversation: ModelMessage[] = [
      { role: 'user', content: 'Browse' },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'old-browser',
            toolName: 'browser_navigate',
            output: { type: 'json', value: largeOutput },
          },
          {
            type: 'tool-result',
            toolCallId: 'latest-browser',
            toolName: 'browser_interact',
            output: { type: 'json', value: largeOutput },
          },
          {
            type: 'tool-result',
            toolCallId: 'latest-bash',
            toolName: 'bash',
            output: { type: 'json', value: 'ok' },
          },
        ],
      },
    ];

    const compacted = compactConversationForStep(conversation, { preserveRecentToolResults: 3 });
    const toolMessage = compacted[1];

    expect(toolMessage?.role).toBe('tool');
    if (toolMessage?.role !== 'tool' || !Array.isArray(toolMessage.content)) {
      throw new Error('expected tool message content');
    }

    expect(toolMessage.content[0]).toMatchObject({
      output: { value: expect.objectContaining({ summary: expect.stringContaining('compacted') }) },
    });
    expect(toolMessage.content[1]).toMatchObject({
      output: { value: expect.objectContaining({ summary: expect.stringContaining('compacted') }) },
    });
    expect(toolMessage.content[2]).toMatchObject({ output: { type: 'json', value: 'ok' } });
  });

  test('strips media from user messages older than the most recent user message', () => {
    const conversation: ModelMessage[] = [
      {
        role: 'user',
        content: [{ type: 'image', image: 'base64', mediaType: 'image/png' }],
      },
      { role: 'assistant', content: 'saw it' },
      {
        role: 'user',
        content: [{ type: 'image', image: 'base64', mediaType: 'image/png' }],
      },
    ];

    const compacted = compactConversationForStep(conversation, { compactToolResults: false });

    expect(compacted[0]).toMatchObject({
      content: [{ type: 'text', text: expect.stringContaining('image/png') }],
    });
    expect(compacted[2]).toBe(conversation[2]);
  });

  test('does not compact error outputs', () => {
    const output = { error: 'failed' };
    expect(compactToolResultOutput({ toolName: 'browser_snapshot', output }, 1)).toBe(output);
  });
});
