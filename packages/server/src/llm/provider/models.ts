import fs from 'node:fs/promises';
import z from 'zod';

import { PROVIDER_IDS, PROVIDER_PLATFORM_REQUIREMENTS, type ProviderId } from '@stitch/shared/providers/types';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'models.dev' });
const URL = 'https://models.dev';

const ALLOWERD_PROVIDER_IDS = PROVIDER_IDS satisfies readonly ProviderId[];

export function isAllowedProvider(providerId: string): boolean {
  return (ALLOWERD_PROVIDER_IDS as readonly string[]).includes(providerId);
}

export const ModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: z.string().optional(),
  release_date: z.string(),
  attachment: z.boolean(),
  reasoning: z.boolean(),
  temperature: z.boolean(),
  tool_call: z.boolean(),
  interleaved: z
    .union([
      z.literal(true),
      z
        .object({
          field: z.enum(['reasoning_content', 'reasoning_details']),
        })
        .strict(),
    ])
    .optional(),
  cost: z
    .object({
      input: z.number(),
      output: z.number(),
      cache_read: z.number().optional(),
      cache_write: z.number().optional(),
      context_over_200k: z
        .object({
          input: z.number(),
          output: z.number(),
          cache_read: z.number().optional(),
          cache_write: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  limit: z.object({
    context: z.number(),
    input: z.number().optional(),
    output: z.number(),
  }),
  modalities: z
    .object({
      input: z.array(z.enum(['text', 'audio', 'image', 'video', 'pdf'])),
      output: z.array(z.enum(['text', 'audio', 'image', 'video', 'pdf'])),
    })
    .optional(),
  experimental: z.boolean().optional(),
  status: z.enum(['alpha', 'beta', 'deprecated']).optional(),
  options: z.record(z.string(), z.any()),
  headers: z.record(z.string(), z.string()).optional(),
  provider: z.object({ npm: z.string().optional(), api: z.string().optional() }).optional(),
  variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
});
export const ProviderSchema = z.object({
  api: z.string().optional(),
  name: z.string(),
  env: z.array(z.string()),
  id: z.string(),
  npm: z.string().optional(),
  models: z.record(z.string(), ModelSchema),
});

export type RawModel = z.infer<typeof ModelSchema>;
export type RawProvider = z.infer<typeof ProviderSchema>;

let data: Record<string, RawProvider> | undefined;

function filterModels(models: Record<string, RawModel>): Record<string, RawModel> {
  return Object.fromEntries(
    Object.entries(models).filter(
      ([, model]) =>
        model.status !== 'deprecated' &&
        !model.id.toLowerCase().includes('embedding') &&
        !model.name.toLowerCase().includes('embedding'),
    ),
  );
}

function sortModels(models: Record<string, RawModel>): Record<string, RawModel> {
  return Object.fromEntries(
    Object.entries(models).toSorted(([, a], [, b]) => b.release_date.localeCompare(a.release_date)),
  );
}

function isAudioCapableModel(model: RawModel): boolean {
  return model.modalities?.input?.includes('audio') ?? false;
}

function filterProviders(raw: Record<string, RawProvider>): Record<string, RawProvider> {
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([key]) => isAllowedProvider(key))
      .map(([key, provider]) => [
        key,
        { ...provider, models: sortModels(filterModels(provider.models)) },
      ]),
  );
}

/** Static providers that are not fetched from models.dev (e.g., on-device models). */
function getStaticProviders(): Record<string, RawProvider> {
  const providers: Record<string, RawProvider> = {};

  const appleFmReq = PROVIDER_PLATFORM_REQUIREMENTS['apple-fm'];
  const platformMatches =
    !appleFmReq || (process.platform === appleFmReq.platform && (!appleFmReq.arch || process.arch === appleFmReq.arch));

  if (platformMatches) {
    providers['apple-fm'] = {
      id: 'apple-fm',
      name: 'Apple Intelligence',
      env: [],
      models: {
        default: {
          id: 'default',
          name: 'Apple Intelligence (On-Device)',
          release_date: '2025-06-01',
          attachment: false,
          reasoning: false,
          temperature: true,
          tool_call: true,
          limit: { context: 4096, output: 4096 },
          modalities: { input: ['text'], output: ['text'] },
          options: {},
        },
      },
    };
  }

  return providers;
}

export async function get(): Promise<Record<string, RawProvider>> {
  if (data) return data;
  const cached = await fs.readFile(PATHS.filePaths.models, 'utf8').catch(() => undefined);

  if (cached) {
    data = { ...filterProviders(JSON.parse(cached) as Record<string, RawProvider>), ...getStaticProviders() };
    return data;
  }

  const json = await fetch(`${URL}/api.json`).then((x) => x.text());
  data = { ...filterProviders(JSON.parse(json) as Record<string, RawProvider>), ...getStaticProviders() };

  return data;
}

export async function getAudioModels(): Promise<Record<string, RawProvider>> {
  const providers = await get();
  const audioProviders: Record<string, RawProvider> = {};

  for (const [providerId, provider] of Object.entries(providers)) {
    const audioModels = Object.fromEntries(
      Object.entries(provider.models).filter(([, model]) => isAudioCapableModel(model)),
    );

    if (Object.keys(audioModels).length === 0) {
      continue;
    }

    audioProviders[providerId] = {
      ...provider,
      models: audioModels,
    };
  }

  return audioProviders;
}

function isEmbeddingModel(model: RawModel): boolean {
  return model.id.toLowerCase().includes('embed') || model.name.toLowerCase().includes('embed');
}

/** Returns only embedding models per provider, preserving the allowed-provider filter. */
export async function getEmbeddingModels(): Promise<Record<string, RawProvider>> {
  const cached = await fs.readFile(PATHS.filePaths.models, 'utf8').catch(() => undefined);
  const raw: Record<string, RawProvider> = cached
    ? (JSON.parse(cached) as Record<string, RawProvider>)
    : await fetch(`${URL}/api.json`).then((x) => x.json() as Promise<Record<string, RawProvider>>);

  const embeddingProviders: Record<string, RawProvider> = {};

  for (const [key, provider] of Object.entries(raw)) {
    if (!isAllowedProvider(key)) continue;

    const embeddingModels = Object.fromEntries(
      Object.entries(provider.models).filter(([, model]) => isEmbeddingModel(model)),
    );

    if (Object.keys(embeddingModels).length === 0) continue;

    embeddingProviders[key] = { ...provider, models: embeddingModels };
  }

  return embeddingProviders;
}

/** Returns the output dimension of an embedding model, or undefined if unknown. */
export function getEmbeddingDimensions(model: RawModel): number | undefined {
  return model.limit?.output;
}

export async function refresh() {
  const result = await fetch(`${URL}/api.json`, {
    signal: AbortSignal.timeout(10 * 1000),
  }).catch((e) => {
    log.error({ error: e }, 'failed to fetch models.dev');
  });
  if (result && result.ok) {
    const text = await result.text();
    await fs.mkdir(PATHS.cacheDir, { recursive: true });
    await fs.writeFile(PATHS.filePaths.models, text, 'utf8');
    data = undefined;
  }
}
