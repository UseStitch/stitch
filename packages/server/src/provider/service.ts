import { getDb } from '@/db/client.js';
import { providerConfig } from '@/db/schema/providers.js';
import { ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import * as EmbeddingModels from '@/llm/provider/embedding-models.js';
import * as Models from '@/llm/provider/models.js';
import * as TranscriptionModels from '@/llm/provider/transcription-models.js';
import { getModelCatalog } from '@/stt/models.js';

export type ProviderCapability = 'llm' | 'stt' | 'embedding' | 'transcription';

export type ProviderWithCapabilities = {
  id: string;
  name: string;
  api: string | undefined;
  enabled: boolean;
  capabilities: ProviderCapability[];
};

type SttModelSummary = {
  id: string;
  name: string;
  sampleRateHz: number;
};

type SttProviderModelsSummary = {
  providerId: string;
  providerName: string;
  models: SttModelSummary[];
};

export async function listProvidersWithCapabilities(): Promise<
  ServiceResult<ProviderWithCapabilities[]>
> {
  const db = getDb();
  const [llmProviders, embeddingProviders, transcriptionProviders, sttCatalog, configs] =
    await Promise.all([
      Models.get(),
      EmbeddingModels.getEmbeddingModels(),
      TranscriptionModels.getTranscriptionModels(),
      getModelCatalog(),
      db.select({ providerId: providerConfig.providerId }).from(providerConfig),
    ]);

  const enabledIds = new Set(configs.map((row) => row.providerId));

  const capabilitiesMap = new Map<string, Set<ProviderCapability>>();

  function ensureEntry(id: string): Set<ProviderCapability> {
    if (!capabilitiesMap.has(id)) capabilitiesMap.set(id, new Set());
    return capabilitiesMap.get(id)!;
  }

  for (const id of Object.keys(llmProviders)) {
    ensureEntry(id).add('llm');
  }

  for (const id of Object.keys(embeddingProviders)) {
    ensureEntry(id).add('embedding');
  }

  for (const provider of transcriptionProviders) {
    ensureEntry(provider.providerId).add('transcription');
  }

  for (const entry of sttCatalog) {
    ensureEntry(entry.providerId).add('stt');
  }

  ensureEntry('ollama_local').add('llm');

  const nameMap: Record<string, string> = {};
  const apiMap: Record<string, string | undefined> = {};

  for (const [id, p] of Object.entries(llmProviders)) {
    nameMap[id] = p.name;
    apiMap[id] = p.api;
  }
  for (const [id, p] of Object.entries(embeddingProviders)) {
    if (!nameMap[id]) {
      nameMap[id] = p.name;
      apiMap[id] = p.api;
    }
  }
  for (const p of transcriptionProviders) {
    if (!nameMap[p.providerId]) {
      nameMap[p.providerId] = p.providerName;
      apiMap[p.providerId] = undefined;
    }
  }
  nameMap['ollama_local'] = 'Ollama';
  apiMap['ollama_local'] = 'http://localhost:11434';
  if (!nameMap['elevenlabs']) {
    nameMap['elevenlabs'] = 'ElevenLabs';
    apiMap['elevenlabs'] = 'https://api.elevenlabs.io';
  }

  const allIds = new Set([
    ...Object.keys(llmProviders),
    ...Object.keys(embeddingProviders),
    ...transcriptionProviders.map((p) => p.providerId),
    ...capabilitiesMap.keys(),
  ]);

  const results: ProviderWithCapabilities[] = [];
  for (const id of allIds) {
    const caps = capabilitiesMap.get(id);
    if (!caps || caps.size === 0) continue;
    results.push({
      id,
      name: nameMap[id] ?? id,
      api: apiMap[id],
      enabled: enabledIds.has(id),
      capabilities: [...caps],
    });
  }

  results.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return ok(results);
}

export async function listEnabledSttModels(): Promise<ServiceResult<SttProviderModelsSummary[]>> {
  const db = getDb();
  const [configs, sttCatalog, llmProviders] = await Promise.all([
    db.select({ providerId: providerConfig.providerId }).from(providerConfig),
    getModelCatalog(),
    Models.get(),
  ]);
  const enabledIds = new Set(configs.map((row) => row.providerId));

  const results: SttProviderModelsSummary[] = [];
  for (const entry of sttCatalog) {
    if (!enabledIds.has(entry.providerId)) continue;
    const providerName = llmProviders[entry.providerId]?.name ?? entry.providerId;
    results.push({
      providerId: entry.providerId,
      providerName,
      models: entry.models.map((m) => ({
        id: m.modelId,
        name: m.displayName,
        sampleRateHz: m.inputFormat.sampleRateHz,
      })),
    });
  }

  return ok(results);
}
