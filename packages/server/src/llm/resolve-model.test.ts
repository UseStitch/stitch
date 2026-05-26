import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type * as Models from '@/llm/provider/models.js';

const getMock = mock<typeof Models.get>(async () => ({}));
const isAllowedProviderMock = mock<typeof Models.isAllowedProvider>(() => true);

mock.module('@/llm/provider/models.js', () => ({
  get: getMock,
  isAllowedProvider: isAllowedProviderMock,
}));

import { getDb } from '@/db/client.js';
import { providerConfig, userSettings } from '@/db/schema.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { resolveModel } from '@/llm/resolve-model.js';

setupTestDb();

const TEST_CREDENTIALS = {
  providerId: 'openai' as const,
  auth: { method: 'api-key' as const, apiKey: 'secret' },
};

describe('resolveModel', () => {
  beforeEach(() => {
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

  async function seedSettings(settings: { key: string; value: string }[]) {
    const db = getDb();
    if (settings.length > 0) {
      await db
        .insert(userSettings)
        .values(settings.map((s) => ({ key: s.key as any, value: s.value })));
    }
  }

  async function seedProviderConfigs(configs: { providerId: string }[]) {
    const db = getDb();
    if (configs.length > 0) {
      await db
        .insert(providerConfig)
        .values(configs.map((c) => ({ providerId: c.providerId, credentials: TEST_CREDENTIALS })));
    }
  }

  test('resolves using settings when present', async () => {
    await seedSettings([
      { key: 'pref.provider', value: 'test-provider' },
      { key: 'pref.model', value: 'test-model' },
    ]);
    await seedProviderConfigs([{ providerId: 'test-provider' }]);

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
    });

    expect('error' in result).toBe(false);
    expect((result as any).data).toEqual({
      providerId: 'test-provider',
      modelId: 'test-model',
      credentials: TEST_CREDENTIALS,
    });
  });

  test('resolves using priorityModelIds when settings are missing', async () => {
    await seedProviderConfigs([
      { providerId: 'other-provider' },
      { providerId: 'test-provider' },
    ]);

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
      priorityModelIds: ['missing-model', 'audio-model'],
    });

    expect('error' in result).toBe(false);
    expect((result as any).data).toEqual({
      providerId: 'test-provider',
      modelId: 'audio-model',
      credentials: TEST_CREDENTIALS,
    });
  });

  test('falls back to fallback keys when priorityModelIds yields no match', async () => {
    await seedProviderConfigs([{ providerId: 'test-provider' }]);

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
      credentials: TEST_CREDENTIALS,
    });
  });

  test('returns error when settings missing without fallback', async () => {
    await seedProviderConfigs([{ providerId: 'test-provider' }]);

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
    await seedSettings([
      { key: 'pref.provider', value: 'invalid-provider' },
      { key: 'pref.model', value: 'test-model' },
    ]);

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
    });

    expect('error' in result).toBe(true);
    expect((result as any).error).toBe('Provider not found');
    expect((result as any).status).toBe(404);
  });

  test('returns error for invalid model', async () => {
    await seedSettings([
      { key: 'pref.provider', value: 'test-provider' },
      { key: 'pref.model', value: 'invalid-model' },
    ]);
    await seedProviderConfigs([{ providerId: 'test-provider' }]);

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
    });

    expect('error' in result).toBe(true);
    expect((result as any).error).toBe('Model not found for provider');
    expect((result as any).status).toBe(400);
  });

  test('returns error when model filter rejects', async () => {
    await seedSettings([
      { key: 'pref.provider', value: 'test-provider' },
      { key: 'pref.model', value: 'test-model' },
    ]);
    await seedProviderConfigs([{ providerId: 'test-provider' }]);

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
    await seedSettings([
      { key: 'pref.provider', value: 'test-provider' },
      { key: 'pref.model', value: 'audio-model' },
    ]);
    await seedProviderConfigs([{ providerId: 'test-provider' }]);

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
      modelFilter: (m: any) => m.modalities?.input?.includes('audio') ?? false,
    });

    expect('error' in result).toBe(false);
    expect((result as any).data).toEqual({
      providerId: 'test-provider',
      modelId: 'audio-model',
      credentials: TEST_CREDENTIALS,
    });
  });

  test('returns error when provider is not configured', async () => {
    await seedSettings([
      { key: 'pref.provider', value: 'test-provider' },
      { key: 'pref.model', value: 'test-model' },
    ]);
    // No provider configs seeded

    const result = await resolveModel({
      providerIdKey: 'pref.provider' as any,
      modelIdKey: 'pref.model' as any,
    });

    expect('error' in result).toBe(true);
    expect((result as any).error).toBe('Provider is not configured');
    expect((result as any).status).toBe(400);
  });
});
