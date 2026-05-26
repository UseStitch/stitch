import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type * as Models from '@/llm/provider/models.js';

const getMock = mock<typeof Models.get>(async () => ({}));
const isAllowedProviderMock = mock<typeof Models.isAllowedProvider>(() => true);

mock.module('@/llm/provider/models.js', () => ({
  get: getMock,
  isAllowedProvider: isAllowedProviderMock,
}));

const mockDbWhere = mock(async () => []);
const mockDbFrom = mock((..._args: unknown[]) => ({ where: mockDbWhere })) as any;
const mockDbSelect = mock((..._args: unknown[]) => ({ from: mockDbFrom }));
const getDbMock = mock(() => ({ select: mockDbSelect }));

mock.module('@/db/client.js', () => ({
  getDb: getDbMock,
}));

import { resolveModel } from '@/llm/resolve-model.js';

describe('resolveModel', () => {
  beforeEach(() => {
    mockDbWhere.mockReset();
    mockDbFrom.mockReset();
    mockDbSelect.mockReset();

    mockDbWhere.mockResolvedValue([]);
    mockDbFrom.mockImplementation((..._args: unknown[]) => ({ where: mockDbWhere }) as any);
    // For the providerConfig select which doesn't have where
    (mockDbFrom as any).mockResolvedValue([]);
    mockDbSelect.mockImplementation((..._args: unknown[]) => ({ from: mockDbFrom }) as any);
    getDbMock.mockImplementation(() => ({ select: mockDbSelect }) as any);

    isAllowedProviderMock.mockImplementation(() => true);
    getMock.mockResolvedValue({
      'test-provider': {
        id: 'test-provider',
        name: 'Test Provider',
        api: 'test',
        env: [],
        models: {
          'test-model': {
            id: 'test-model',
            name: 'Test Model',
            cost: { input: 0, output: 0 },
            limit: { context: 1000, output: 1000 },
            release_date: '2024',
            attachment: false,
            reasoning: false,
            temperature: false,
            tool_call: false,
            options: {},
          },
          'audio-model': {
            id: 'audio-model',
            name: 'Audio Model',
            cost: { input: 0, output: 0 },
            limit: { context: 1000, output: 1000 },
            release_date: '2024',
            attachment: false,
            reasoning: false,
            temperature: false,
            tool_call: false,
            options: {},
            modalities: { input: ['audio', 'text'], output: ['text'] },
          },
        },
      },
    });
  });

  function mockDbResponses(settings: { key: string; value: string }[], configs: any[]) {
    mockDbSelect.mockReturnValueOnce({
      from: mock((..._args: unknown[]) => ({
        where: mock(async () => settings),
      })),
    } as any);
    mockDbSelect.mockReturnValueOnce({
      from: mock(async () => configs),
    } as any);
  }

  test('resolves using settings when present', async () => {
    mockDbResponses(
      [
        { key: 'pref.provider', value: 'test-provider' },
        { key: 'pref.model', value: 'test-model' },
      ],
      [{ providerId: 'test-provider', credentials: { apiKey: 'secret' } }],
    );

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
    });

    expect('error' in result).toBe(false);
    expect((result as any).data).toEqual({
      providerId: 'test-provider',
      modelId: 'test-model',
      credentials: { apiKey: 'secret' },
    });
  });

  test('resolves using priorityModelIds when settings are missing', async () => {
    mockDbResponses(
      [],
      [
        { providerId: 'other-provider', credentials: { apiKey: 'secret2' } },
        { providerId: 'test-provider', credentials: { apiKey: 'secret' } },
      ],
    );

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
      priorityModelIds: ['missing-model', 'audio-model'],
    });

    expect('error' in result).toBe(false);
    expect((result as any).data).toEqual({
      providerId: 'test-provider',
      modelId: 'audio-model',
      credentials: { apiKey: 'secret' },
    });
  });

  test('falls back to fallback keys when priorityModelIds yields no match', async () => {
    mockDbResponses([], [{ providerId: 'test-provider', credentials: { apiKey: 'secret' } }]);

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
      priorityModelIds: ['missing-model1', 'missing-model2'],
      fallbackProviderId: 'test-provider',
      fallbackModelId: 'test-model',
    });

    expect('error' in result).toBe(false);
    expect((result as any).data).toEqual({
      providerId: 'test-provider',
      modelId: 'test-model',
      credentials: { apiKey: 'secret' },
    });
  });

  test('returns error when settings missing without fallback', async () => {
    mockDbResponses([], [{ providerId: 'test-provider', credentials: { apiKey: 'secret' } }]);

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
    });

    expect('error' in result).toBe(true);
    expect((result as any).error).toBe('No model configured and no fallback available');
    expect((result as any).status).toBe(400);
  });

  test('returns error for invalid provider', async () => {
    isAllowedProviderMock.mockImplementation(() => false);
    mockDbResponses(
      [
        { key: 'pref.provider', value: 'invalid-provider' },
        { key: 'pref.model', value: 'test-model' },
      ],
      [],
    );

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
    });

    expect('error' in result).toBe(true);
    expect((result as any).error).toBe('Provider not found');
    expect((result as any).status).toBe(404);
  });

  test('returns error for invalid model', async () => {
    mockDbResponses(
      [
        { key: 'pref.provider', value: 'test-provider' },
        { key: 'pref.model', value: 'invalid-model' },
      ],
      [{ providerId: 'test-provider', credentials: { apiKey: 'secret' } }],
    );

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
    });

    expect('error' in result).toBe(true);
    expect((result as any).error).toBe('Model not found for provider');
    expect((result as any).status).toBe(400);
  });

  test('returns error when model filter rejects', async () => {
    mockDbResponses(
      [
        { key: 'pref.provider', value: 'test-provider' },
        { key: 'pref.model', value: 'test-model' },
      ],
      [{ providerId: 'test-provider', credentials: { apiKey: 'secret' } }],
    );

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
      modelFilter: (m: any) => m.modalities?.input?.includes('audio') ?? false,
    });

    expect('error' in result).toBe(true);
    expect((result as any).error).toBe('Model does not meet required capabilities');
    expect((result as any).status).toBe(400);
  });

  test('succeeds when model filter passes', async () => {
    mockDbResponses(
      [
        { key: 'pref.provider', value: 'test-provider' },
        { key: 'pref.model', value: 'audio-model' },
      ],
      [{ providerId: 'test-provider', credentials: { apiKey: 'secret' } }],
    );

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
      modelFilter: (m: any) => m.modalities?.input?.includes('audio') ?? false,
    });

    expect('error' in result).toBe(false);
    expect((result as any).data).toEqual({
      providerId: 'test-provider',
      modelId: 'audio-model',
      credentials: { apiKey: 'secret' },
    });
  });

  test('returns error when provider is not configured', async () => {
    mockDbResponses(
      [
        { key: 'pref.provider', value: 'test-provider' },
        { key: 'pref.model', value: 'test-model' },
      ],
      [],
    );

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
    });

    expect('error' in result).toBe(true);
    expect((result as any).error).toBe('Provider is not configured');
    expect((result as any).status).toBe(400);
  });
});
