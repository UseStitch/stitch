import { APICallError } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

import { generateTitleFromContent } from '@/title-generation/generator.js';

const RESOLVED_MODEL = {
  providerId: 'openai' as const,
  modelId: 'gpt-5-nano',
  credentials: { providerId: 'openai' as const, auth: { method: 'api-key' as const, apiKey: 'test-key' } },
};

function makeMockModel(text: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text }],
      finishReason: { unified: 'stop' as const, raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

describe('generateTitleFromContent', () => {
  beforeEach(() => {
    mock.restore();
  });

  test('returns trimmed title from model response', async () => {
    const model = makeMockModel('  Project Setup  ');

    const result = await generateTitleFromContent('Generate a title for setup help', 'openai', 'gpt-5', {
      resolveModel: async () => RESOLVED_MODEL,
      getModel: () => model,
    });

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Project Setup');
    expect(result!.providerId).toBe('openai');
    expect(result!.modelId).toBe('gpt-5-nano');
  });

  test('strips surrounding quotes from title', async () => {
    const model = makeMockModel('"Debug Auth Flow"');
    const result = await generateTitleFromContent('Generate a title for auth debugging', 'openai', 'gpt-5', {
      resolveModel: async () => RESOLVED_MODEL,
      getModel: () => model,
    });

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Debug Auth Flow');
  });

  test('returns null when model returns empty text', async () => {
    const model = makeMockModel('   ');
    const result = await generateTitleFromContent('Generate a title', 'openai', 'gpt-5', {
      resolveModel: async () => RESOLVED_MODEL,
      getModel: () => model,
    });

    expect(result).toBeNull();
  });

  test('returns null when no cheap model can be resolved', async () => {
    const result = await generateTitleFromContent('Generate a title', 'openai', 'gpt-5', {
      resolveModel: async () => null,
    });

    expect(result).toBeNull();
  });

  test('returns usage data from the model response', async () => {
    const model = makeMockModel('Chat Title');
    const result = await generateTitleFromContent('Generate a title for AI discussion', 'openai', 'gpt-5', {
      resolveModel: async () => RESOLVED_MODEL,
      getModel: () => model,
    });

    expect(result).not.toBeNull();
    expect(result!.usage).not.toBeNull();
    expect(result!.usage!.inputTokens).toBe(10);
    expect(result!.usage!.outputTokens).toBe(5);
  });

  test('returns null on API error and does not throw', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new APICallError({
          message: 'Model not found',
          url: 'https://api.example.com/v1/chat',
          requestBodyValues: {},
          statusCode: 404,
          isRetryable: false,
        });
      },
    });

    const result = await generateTitleFromContent('Generate a title', 'openai', 'gpt-5', {
      resolveModel: async () => RESOLVED_MODEL,
      getModel: () => model,
    });

    expect(result).toBeNull();
  });

  test('passes caller-provided content to the model unchanged', async () => {
    const model = makeMockModel('Test Title');
    const content = 'Caller prepared content with auth-service.ts and meeting notes';

    await generateTitleFromContent(content, 'openai', 'gpt-5', {
      resolveModel: async () => RESOLVED_MODEL,
      getModel: () => model,
    });

    expect(model.doGenerateCalls).toHaveLength(1);
    const messages = model.doGenerateCalls[0].prompt;
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage).toBeDefined();

    const textContent = userMessage!.content.find((c): c is { type: 'text'; text: string } => c.type === 'text');
    expect(textContent?.text).toBe(content);
  });
});
