import fs from 'node:fs/promises';
import path from 'node:path';

import googleRegistry from '@stitch/registry-embeddings/models/google.json';
import openaiRegistry from '@stitch/registry-embeddings/models/openai.json';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import {
  EmbeddingProviderSchema,
  EmbeddingRegistryPayloadSchema,
  type EmbeddingModel,
  type EmbeddingProvider,
  type EmbeddingRegistryPayload,
} from '@/llm/provider/embedding-schema.js';
import type { RawModel, RawProvider } from '@/llm/provider/models.js';

const log = Log.create({ service: 'embedding-registry' });
const DEFAULT_EMBEDDING_REGISTRY_URL = 'https://usestitch.ai/embedding-models.json';
const FETCH_TIMEOUT_MS = 10_000;

const registries = [googleRegistry, openaiRegistry] as const;
let inMemoryRegistry: EmbeddingRegistryPayload | null = null;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function toRawModel(model: EmbeddingModel): RawModel {
  return {
    id: model.id,
    name: model.name,
    family: model.family,
    release_date: model.release_date,
    attachment: false,
    reasoning: false,
    temperature: false,
    tool_call: false,
    cost: model.cost,
    limit: {
      context: model.context,
      output: model.dimensions,
    },
    modalities: {
      input: model.inputModalities ?? ['text'],
      output: model.outputModalities ?? ['text'],
    },
    options: {},
  };
}

function toRawProvider(provider: EmbeddingProvider): RawProvider {
  const models = Object.fromEntries(provider.models.map((model) => [model.id, toRawModel(model)]));

  return {
    id: provider.providerId,
    name: provider.providerName,
    api: provider.api,
    npm: provider.npm,
    env: provider.env ?? [],
    models,
  };
}

function toRawProviders(providers: EmbeddingProvider[]): Record<string, RawProvider> {
  return Object.fromEntries(
    providers.map((provider) => [provider.providerId, toRawProvider(provider)]),
  );
}

function getRegistryUrl(): string {
  return process.env['STITCH_EMBEDDING_REGISTRY_URL']?.trim() || DEFAULT_EMBEDDING_REGISTRY_URL;
}

function parseRegistryPayload(raw: unknown): EmbeddingRegistryPayload {
  return EmbeddingRegistryPayloadSchema.parse(raw);
}

function getBundledRegistryPayload(): EmbeddingRegistryPayload {
  return {
    version: 1,
    generatedAt: new Date(0).toISOString(),
    providers: registries.map((registry) => EmbeddingProviderSchema.parse(registry)),
  };
}

async function readRegistryFromDisk(): Promise<EmbeddingRegistryPayload | null> {
  const text = await fs.readFile(PATHS.filePaths.embeddingModelsRegistry, 'utf8').catch(() => null);
  if (!text) return null;

  try {
    return parseRegistryPayload(JSON.parse(text));
  } catch (error) {
    log.warn({ error }, 'failed to read embedding registry cache');
    return null;
  }
}

async function writeRegistryToDisk(payload: EmbeddingRegistryPayload): Promise<void> {
  await fs.mkdir(path.dirname(PATHS.filePaths.embeddingModelsRegistry), { recursive: true });
  await fs.writeFile(
    PATHS.filePaths.embeddingModelsRegistry,
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
}

async function fetchRegistryPayload(fetchImpl: FetchLike): Promise<EmbeddingRegistryPayload> {
  const response = await fetchImpl(getRegistryUrl(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return parseRegistryPayload(await response.json());
}

export async function getEmbeddingModelsFromRegistry(
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, RawProvider>> {
  if (inMemoryRegistry) return toRawProviders(inMemoryRegistry.providers);

  const cached = await readRegistryFromDisk();
  if (cached) {
    inMemoryRegistry = cached;
    return toRawProviders(cached.providers);
  }

  try {
    const payload = await fetchRegistryPayload(fetchImpl);
    await writeRegistryToDisk(payload);
    inMemoryRegistry = payload;
    return toRawProviders(payload.providers);
  } catch (error) {
    log.warn({ error }, 'failed to fetch embedding registry, using bundled registry');
    const bundled = getBundledRegistryPayload();
    inMemoryRegistry = bundled;
    return toRawProviders(bundled.providers);
  }
}
