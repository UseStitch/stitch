import { APICallError } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { generateTitle } from '@/llm/title-generator.js';

const mocks = vi.hoisted(() => ({
  resolveCheapModelMock: vi.fn(),
  createProviderMock: vi.fn(),
}));

vi.mock('@/llm/resolve-cheap-model.js', () => ({
  resolveCheapModel: mocks.resolveCheapModelMock,
}));

vi.mock('@/provider/provider.js', () => ({
  createProvider: mocks.createProviderMock,
}));

const RESOLVED_MODEL = {
  providerId: 'openai',
  modelId: 'gpt-5-nano',
  credentials: {
    providerId: 'openai',
    auth: { method: 'api-key', apiKey: 'test-key' },
  },
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

function setupProvider(model: MockLanguageModelV3): void {
  mocks.createProviderMock.mockReturnValue(() => model);
  mocks.resolveCheapModelMock.mockResolvedValue(RESOLVED_MODEL);
}

describe('generateTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns trimmed title from model response', async () => {
    const model = makeMockModel('  Project Setup  ');
    setupProvider(model);

    const result = await generateTitle('Help me set up my project', 'openai', 'gpt-5');

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Project Setup');
    expect(result!.providerId).toBe('openai');
    expect(result!.modelId).toBe('gpt-5-nano');
  });

  test('strips surrounding quotes from title', async () => {
    const model = makeMockModel('"Debug Auth Flow"');
    setupProvider(model);

    const result = await generateTitle('I have a bug in my auth', 'openai', 'gpt-5');

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Debug Auth Flow');
  });

  test('strips single quotes from title', async () => {
    const model = makeMockModel("'Fix Login Bug'");
    setupProvider(model);

    const result = await generateTitle('Login is broken', 'openai', 'gpt-5');

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Fix Login Bug');
  });

  test('returns null when model returns empty text', async () => {
    const model = makeMockModel('   ');
    setupProvider(model);

    const result = await generateTitle('Hello', 'openai', 'gpt-5');

    expect(result).toBeNull();
  });

  test('returns null when no cheap model can be resolved', async () => {
    mocks.resolveCheapModelMock.mockResolvedValue(null);

    const result = await generateTitle('Hello', 'openai', 'gpt-5');

    expect(result).toBeNull();
    expect(mocks.createProviderMock).not.toHaveBeenCalled();
  });

  test('returns usage data from the model response', async () => {
    const model = makeMockModel('Chat Title');
    setupProvider(model);

    const result = await generateTitle('Tell me about AI', 'openai', 'gpt-5');

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
    setupProvider(model);

    const result = await generateTitle('Hello', 'openai', 'gpt-5');

    expect(result).toBeNull();
  });

  test('returns null on unexpected errors and does not throw', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error('unexpected network failure');
      },
    });
    setupProvider(model);

    const result = await generateTitle('Hello', 'openai', 'gpt-5');

    expect(result).toBeNull();
  });

  test('passes first message to model as part of the prompt', async () => {
    const model = makeMockModel('Test Title');
    setupProvider(model);

    await generateTitle('My specific first message', 'openai', 'gpt-5');

    expect(model.doGenerateCalls).toHaveLength(1);
    const messages = model.doGenerateCalls[0].prompt;
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage).toBeDefined();

    const textContent = userMessage!.content.find(
      (c): c is { type: 'text'; text: string } => c.type === 'text',
    );
    expect(textContent?.text).toContain('My specific first message');
  });
});
