import { describe, expect, test } from 'vitest';
import type { LanguageModelV3Prompt } from '@ai-sdk/provider';

import { convertPromptToMessages } from '../src/apple-fm-prompt';

describe('convertPromptToMessages', () => {
  test('converts system message', () => {
    const prompt: LanguageModelV3Prompt = [{ role: 'system', content: 'You are helpful' }];

    const result = convertPromptToMessages(prompt);

    expect(result).toEqual([{ role: 'system', content: 'You are helpful' }]);
  });

  test('converts user message with text parts', () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' },
        ],
      },
    ];

    const result = convertPromptToMessages(prompt);

    expect(result).toEqual([{ role: 'user', content: 'Hello\nWorld' }]);
  });

  test('skips file parts in user messages', () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this' },
          { type: 'file', data: 'base64data', mediaType: 'image/png' },
        ],
      },
    ];

    const result = convertPromptToMessages(prompt);

    expect(result).toEqual([{ role: 'user', content: 'Check this' }]);
  });

  test('converts assistant message with text', () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'I can help' }],
      },
    ];

    const result = convertPromptToMessages(prompt);

    expect(result).toEqual([{ role: 'assistant', content: 'I can help' }]);
  });

  test('converts assistant message with tool calls', () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me search' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'search',
            input: { query: 'test' },
          },
        ],
      },
    ];

    const result = convertPromptToMessages(prompt);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'Let me search',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"test"}',
            },
          },
        ],
      },
    ]);
  });

  test('converts assistant message with string input in tool call', () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'calc',
            input: '{"x":1}',
          },
        ],
      },
    ];

    const result = convertPromptToMessages(prompt);

    expect(result[0].tool_calls![0].function.arguments).toBe('{"x":1}');
  });

  test('converts tool result messages with text output', () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'search',
            output: { type: 'text', value: 'Found 5 results' },
          },
        ],
      },
    ];

    const result = convertPromptToMessages(prompt);

    expect(result).toEqual([
      {
        role: 'tool',
        content: JSON.stringify({
          tool_calls: [
            {
              id: 'call-1',
              toolName: 'search',
              segments: [{ type: 'text', text: 'Found 5 results' }],
            },
          ],
        }),
      },
    ]);
  });

  test('converts tool result messages with json output', () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'getData',
            output: { type: 'json', value: { count: 5, items: ['a', 'b'] } },
          },
        ],
      },
    ];

    const result = convertPromptToMessages(prompt);
    const parsed = JSON.parse(result[0].content);

    expect(parsed.tool_calls[0].segments[0].text).toBe('{"count":5,"items":["a","b"]}');
  });

  test('converts multi-turn conversation', () => {
    const prompt: LanguageModelV3Prompt = [
      { role: 'system', content: 'Be helpful' },
      { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] },
      { role: 'user', content: [{ type: 'text', text: 'How are you?' }] },
    ];

    const result = convertPromptToMessages(prompt);

    expect(result).toHaveLength(4);
    expect(result[0].role).toBe('system');
    expect(result[1].role).toBe('user');
    expect(result[2].role).toBe('assistant');
    expect(result[3].role).toBe('user');
  });

  test('includes reasoning parts in assistant message text', () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Thinking about it...' },
          { type: 'text', text: 'The answer is 42' },
        ],
      },
    ];

    const result = convertPromptToMessages(prompt);

    expect(result[0].content).toBe('Thinking about it...\nThe answer is 42');
  });
});
