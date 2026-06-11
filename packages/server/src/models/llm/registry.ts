import z from 'zod';

import { PROVIDER_IDS, type ProviderId } from '@stitch/shared/providers/types';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { createRegistryCache } from '@/lib/registry-cache.js';

const log = Log.create({ service: 'models.dev' });
const MODELS_DEV_URL = 'https://models.dev/api.json';

const ALLOWERD_PROVIDER_IDS = PROVIDER_IDS satisfies readonly ProviderId[];

export function isAllowedProvider(providerId: string): boolean {
  return (ALLOWERD_PROVIDER_IDS as readonly string[]).includes(providerId);
}

export const ModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: z.string().optional(),
  release_date: z.string(),
  status: z.enum(['alpha', 'beta', 'deprecated']).optional(),
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
});
export const ProviderSchema = z.object({
  api: z.string().optional(),
  name: z.string(),
  id: z.string(),
  models: z.record(z.string(), ModelSchema),
});

const RegistrySchema = z.record(z.string(), ProviderSchema);

export type RawModel = z.infer<typeof ModelSchema>;
export type RawProvider = z.infer<typeof ProviderSchema>;

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

const registryCache = createRegistryCache<Record<string, RawProvider>>({
  cacheFilePath: PATHS.filePaths.models,
  url: MODELS_DEV_URL,
  parse: (raw) => RegistrySchema.parse(raw),
});

export async function get(): Promise<Record<string, RawProvider>> {
  return filterProviders(await registryCache.get());
}

export async function refresh(): Promise<void> {
  log.info('refreshing models.dev registry');
  await registryCache.refresh();
}
