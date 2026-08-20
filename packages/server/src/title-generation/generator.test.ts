import { APICallError } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

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

let resolvedModel: typeof RESOLVED_MODEL | null = RESOLVED_MODEL;
let model = makeMockModel('');
const { resolveCheapModel: actualResolveCheapModel } = await import('@/llm/resolve-cheap-model.js');
const { createProvider: actualCreateProvider } = await import('@/llm/provider/provider.js');

void mock.module('@/llm/resolve-cheap-model.js', () => ({ resolveCheapModel: async () => resolvedModel }));

void mock.module('@/llm/provider/provider.js', () => ({ createProvider: () => () => model }));

const { generateTitleFromContent } = await import('@/title-generation/generator.js');

afterAll(() => {
  void mock.module('@/llm/resolve-cheap-model.js', () => ({ resolveCheapModel: actualResolveCheapModel }));
  void mock.module('@/llm/provider/provider.js', () => ({ createProvider: actualCreateProvider }));
});

describe('generateTitleFromContent', () => {
  beforeEach(() => {
    resolvedModel = RESOLVED_MODEL;
    model = makeMockModel('');
  });

  test('returns normalized title, model metadata, usage, and forwards prompt content unchanged', async () => {
    model = makeMockModel('  Project Setup  ');
    const content = 'Caller prepared content with auth-service.ts and meeting notes';

    const result = await generateTitleFromContent(content, 'openai', 'gpt-5');

    expect(result?.title).toBe('Project Setup');
    expect(result?.providerId).toBe('openai');
    expect(result?.modelId).toBe('gpt-5-nano');
    expect(result?.usage?.inputTokens).toBe(10);
    expect(result?.usage?.outputTokens).toBe(5);

    expect(model.doGenerateCalls).toHaveLength(1);
    const messages = model.doGenerateCalls[0].prompt;
    const userMessage = messages.find((m) => m.role === 'user');
    const textContent = userMessage?.content.find((c): c is { type: 'text'; text: string } => c.type === 'text');
    expect(textContent?.text).toBe(content);
  });

  test('strips surrounding quotes from title', async () => {
    model = makeMockModel('"Debug Auth Flow"');
    const result = await generateTitleFromContent('Generate a title for auth debugging', 'openai', 'gpt-5');

    expect(result?.title).toBe('Debug Auth Flow');
  });

  test('returns null when model returns empty text', async () => {
    model = makeMockModel('   ');
    const result = await generateTitleFromContent('Generate a title', 'openai', 'gpt-5');

    expect(result).toBeNull();
  });

  test('returns null when no cheap model can be resolved', async () => {
    resolvedModel = null;
    const result = await generateTitleFromContent('Generate a title', 'openai', 'gpt-5');

    expect(result).toBeNull();
  });

  test('returns null on API error and does not throw', async () => {
    model = new MockLanguageModelV3({
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

    const result = await generateTitleFromContent('Generate a title', 'openai', 'gpt-5');

    expect(result).toBeNull();
  });
});
