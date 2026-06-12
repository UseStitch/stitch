import { describe, expect, test } from 'bun:test';

import { createOpenAIMessageParser } from '@/stt/adapters/openai.js';

describe('createOpenAIMessageParser', () => {
  test('parses token usage from completed transcription events', () => {
    const parseMessage = createOpenAIMessageParser(Date.now() - 1000);

    const result = parseMessage(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'Hi, can you hear me?',
        usage: {
          type: 'tokens',
          total_tokens: 26,
          input_tokens: 17,
          input_token_details: {
            text_tokens: 0,
            audio_tokens: 17,
          },
          output_tokens: 9,
        },
      }),
    );

    expect(result?.usage?.audioInputTokens).toBe(17);
    expect(result?.usage?.textOutputTokens).toBe(9);
    expect(result?.usage?.durationMs).toBeGreaterThan(0);
  });

  test('falls back to input tokens when audio token details are absent', () => {
    const parseMessage = createOpenAIMessageParser(Date.now() - 1000);

    const result = parseMessage(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'Fallback usage',
        usage: {
          type: 'tokens',
          total_tokens: 12,
          input_tokens: 8,
          output_tokens: 4,
        },
      }),
    );

    expect(result?.usage?.audioInputTokens).toBe(8);
    expect(result?.usage?.textOutputTokens).toBe(4);
  });

  test('parses duration usage from completed transcription events', () => {
    const parseMessage = createOpenAIMessageParser(Date.now() - 1000);

    const result = parseMessage(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'Duration usage',
        usage: {
          type: 'duration',
          seconds: 1.25,
        },
      }),
    );

    expect(result?.usage).toEqual({ durationMs: 1250 });
  });
});
