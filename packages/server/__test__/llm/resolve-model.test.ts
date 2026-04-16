import { beforeEach, describe, expect, test, vi } from 'vitest';
import { resolveModel } from '@/llm/resolve-model.js';
import * as Models from '@/llm/provider/models.js';
import { getDb } from '@/db/client.js';

vi.mock('@/db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/llm/provider/models.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Models>();
  return {
    ...actual,
    get: vi.fn(),
    isAllowedProvider: vi.fn(),
  };
});

describe('resolveModel', () => {
  let mockDbSelect: any;
  let mockDbFrom: any;
  let mockDbWhere: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDbWhere = vi.fn().mockResolvedValue([]);
    mockDbFrom = vi.fn().mockReturnValue({ where: mockDbWhere });
    mockDbSelect = vi.fn().mockReturnValue({ from: mockDbFrom });

    // For the providerConfig select which doesn't have where
    mockDbFrom.mockResolvedValue([]);

    const mockDb = { select: mockDbSelect };
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    vi.mocked(Models.isAllowedProvider).mockReturnValue(true);
    vi.mocked(Models.get).mockResolvedValue({
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
    // The query first calls db.select() for settings, then db.select() for configs
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(settings),
      }),
    });
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockResolvedValue(configs),
    });
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
      priorityModelIds: ['missing-model', 'audio-model'], // test-provider has audio-model
    });

    expect('error' in result).toBe(false);
    expect((result as any).data).toEqual({
      providerId: 'test-provider',
      modelId: 'audio-model',
      credentials: { apiKey: 'secret' },
    });
  });

  test('falls back to fallback keys when priorityModelIds yields no match', async () => {
    mockDbResponses(
      [],
      [{ providerId: 'test-provider', credentials: { apiKey: 'secret' } }],
    );

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
    vi.mocked(Models.isAllowedProvider).mockReturnValue(false);
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
        { key: 'pref.model', value: 'test-model' }, // Note: test-model does not have audio modality
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
        { key: 'pref.model', value: 'audio-model' }, // audio-model has audio modality
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
      [], // No configs
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
