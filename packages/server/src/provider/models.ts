import fs from 'node:fs/promises';
import z from 'zod';

import { PROVIDER_IDS, type ProviderId } from '@openwork/shared';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'models.dev' });
const URL = 'https://models.dev';

export const ALLOWERD_PROVIDER_IDS = PROVIDER_IDS satisfies readonly ProviderId[];

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

function filterProviders(raw: Record<string, RawProvider>): Record<string, RawProvider> {
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([key]) => (ALLOWERD_PROVIDER_IDS as readonly string[]).includes(key))
      .map(([key, provider]) => [
        key,
        { ...provider, models: sortModels(filterModels(provider.models)) },
      ]),
  );
}

export async function get(): Promise<Record<string, RawProvider>> {
  if (data) return data as Record<string, RawProvider>;
  const cached = await fs.readFile(PATHS.filePaths.models, 'utf8').catch(() => undefined);

  if (cached) {
    data = filterProviders(JSON.parse(cached) as Record<string, RawProvider>);
    return data as Record<string, RawProvider>;
  }

  const json = await fetch(`${URL}/api.json`).then((x) => x.text());
  data = filterProviders(JSON.parse(json) as Record<string, RawProvider>);

  return data as Record<string, RawProvider>;
}

export async function refresh() {
  const result = await fetch(`${URL}/api.json`, {
    signal: AbortSignal.timeout(10 * 1000),
  }).catch((e) => {
    log.error('Failed to fetch models.dev', { error: e });
  });
  if (result && result.ok) {
    const text = await result.text();
    await fs.mkdir(PATHS.cacheDir, { recursive: true });
    await fs.writeFile(PATHS.filePaths.models, text, 'utf8');
    data = undefined;
  }
}
