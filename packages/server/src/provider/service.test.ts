import { describe, expect, test } from 'bun:test';

import { getDb } from '@/db/client.js';
import { localModels } from '@/db/schema/providers.js';
import { setupTestDb } from '@/db/test-helpers.js';
import {
  deleteProviderCredentials,
  getEmbeddingModelDimensions,
  getProvider,
  getProviderCredentials,
  getStoredBaseURL,
  isProviderConfigured,
  listConfiguredProviderConfigs,
  listConfiguredProviderIds,
  listEnabledProviderEmbeddingModels,
  listEnabledSttModels,
  listProviderModels,
  listProvidersWithCapabilities,
  upsertProviderCredentials,
} from '@/provider/service.js';

setupTestDb();

describe('Provider Service - Credentials & Persistence', () => {
  test('returns 404 for unknown provider on get, upsert, and delete', async () => {
    expect(getProviderCredentials('not-a-provider')).rejects.toThrow('Provider not found');
    expect(upsertProviderCredentials('not-a-provider', {})).rejects.toThrow('Provider not found');
    expect(deleteProviderCredentials('not-a-provider')).rejects.toThrow('Provider not found');
  });

  test('manages provider credentials lifecycle (upsert, get, query, delete)', async () => {
    expect(await isProviderConfigured('openai')).toBe(false);
    expect(getProviderCredentials('openai')).rejects.toThrow('Provider not configured');

    // Invalid credentials reject with 400
    expect(upsertProviderCredentials('openai', { auth: { method: 'invalid' } })).rejects.toThrow('Invalid credentials');

    // Upsert valid credentials
    await upsertProviderCredentials('openai', { auth: { method: 'api-key', apiKey: 'sk-test-key' } });

    expect(await isProviderConfigured('openai')).toBe(true);
    const creds = await getProviderCredentials('openai');
    expect(creds.providerId).toBe('openai');
    expect(creds.auth).toEqual({ method: 'api-key', apiKey: 'sk-test-key' });

    // listConfiguredProviderIds and configs reflect the change
    const ids = await listConfiguredProviderIds();
    expect(ids).toContain('openai');

    const configs = await listConfiguredProviderConfigs();
    const openaiConfig = configs.find((c) => c.providerId === 'openai');
    expect(openaiConfig).toBeDefined();
    expect(openaiConfig?.credentials.auth).toEqual({ method: 'api-key', apiKey: 'sk-test-key' });

    // Delete credentials
    await deleteProviderCredentials('openai');
    expect(await isProviderConfigured('openai')).toBe(false);
    expect(getProviderCredentials('openai')).rejects.toThrow('Provider not configured');
  });

  test('deleting a local provider also cascades deletion to localModels table', async () => {
    await upsertProviderCredentials('ollama_local', { baseURL: 'http://localhost:11434', auth: { method: 'none' } });

    const db = getDb();
    await db
      .insert(localModels)
      .values({
        id: 'local-test-model',
        name: 'Local Test Model',
        provider: 'ollama_local',
        contextWindow: 4096,
        outputLimit: 2048,
        inputCostPerMillion: 0,
        outputCostPerMillion: 0,
        inputModalities: ['text'],
        outputModalities: ['text'],
      });

    expect(await getStoredBaseURL('ollama_local')).toBe('http://localhost:11434');

    const modelsBefore = await db.select().from(localModels);
    expect(modelsBefore.length).toBe(1);

    await deleteProviderCredentials('ollama_local');

    const modelsAfter = await db.select().from(localModels);
    expect(modelsAfter.length).toBe(0);
    expect(await getStoredBaseURL('ollama_local')).toBeNull();
  });
});

describe('Provider Service - Capability & Summary Inspection', () => {
  test('listProvidersWithCapabilities returns all catalog providers with enabled state', async () => {
    await upsertProviderCredentials('anthropic', { auth: { method: 'api-key', apiKey: 'ant-key' } });

    const providers = await listProvidersWithCapabilities();
    expect(providers.length).toBeGreaterThan(0);

    const anthropic = providers.find((p) => p.id === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic?.enabled).toBe(true);
    expect(anthropic?.capabilities).toContain('llm');

    // Enabled providers sort first
    expect(providers[0].enabled).toBe(true);
  });

  test('getProvider returns summaries for standard, local, and STT providers', async () => {
    // Standard provider when unconfigured
    const anthropicBefore = await getProvider('anthropic');
    expect(anthropicBefore.id).toBe('anthropic');
    expect(anthropicBefore.enabled).toBe(false);
    expect(anthropicBefore.model_count).toBeGreaterThan(0);

    // Standard provider when configured
    await upsertProviderCredentials('anthropic', { auth: { method: 'api-key', apiKey: 'ant-key' } });
    const anthropicAfter = await getProvider('anthropic');
    expect(anthropicAfter.enabled).toBe(true);

    // STT provider without models.dev catalog
    const elevenlabsSummary = await getProvider('elevenlabs');
    expect(elevenlabsSummary.id).toBe('elevenlabs');
    expect(elevenlabsSummary.name).toBe('ElevenLabs');
    expect(elevenlabsSummary.enabled).toBe(false);

    // Local provider
    const ollamaSummary = await getProvider('ollama_local');
    expect(ollamaSummary.id).toBe('ollama_local');
    expect(ollamaSummary.name).toBe('Ollama');
    expect(ollamaSummary.enabled).toBe(false);
  });

  test('listProviderModels lists models for standard providers', async () => {
    const models = await listProviderModels('anthropic');
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('name');
  });
});

describe('Provider Service - Modality Catalogs', () => {
  test('listEnabledSttModels returns STT models only for enabled providers', async () => {
    expect(await listEnabledSttModels()).toEqual([]);

    await upsertProviderCredentials('assemblyai', { auth: { method: 'api-key', apiKey: 'test-assembly-key' } });

    const sttModels = await listEnabledSttModels();
    expect(sttModels.length).toBeGreaterThan(0);
    const assemblyEntry = sttModels.find((e) => e.providerId === 'assemblyai');
    expect(assemblyEntry).toBeDefined();
    expect(assemblyEntry?.models.length).toBeGreaterThan(0);
  });

  test('listEnabledProviderEmbeddingModels returns embedding models only for enabled providers', async () => {
    await upsertProviderCredentials('openai', { auth: { method: 'api-key', apiKey: 'test-openai-key' } });

    const embeddingProviders = await listEnabledProviderEmbeddingModels();
    const openaiEntry = embeddingProviders.find((e) => e.providerId === 'openai');
    expect(openaiEntry).toBeDefined();
    expect(openaiEntry?.models.length).toBeGreaterThan(0);

    const dims = await getEmbeddingModelDimensions('openai', 'text-embedding-3-small');
    expect(dims).toBe(1536);
  });
});
