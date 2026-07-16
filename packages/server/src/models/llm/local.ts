import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@/db/client.js';
import { localModels, providerConfig, type LocalProviderId } from '@/db/schema/providers.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { ModelSchema } from '@/models/llm/registry.js';

export type LocalModel = typeof localModels.$inferSelect;

const MODALITY = ModelSchema.shape.modalities.unwrap().shape.input.element;

export const LocalModelInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  contextWindow: z.number().int().positive().default(8192),
  inputLimit: z.number().int().positive().optional(),
  outputLimit: z.number().int().positive().default(8192),
  inputCostPerMillion: z.number().nonnegative().default(0),
  outputCostPerMillion: z.number().nonnegative().default(0),
  cacheReadCostPerMillion: z.number().nonnegative().optional(),
  cacheWriteCostPerMillion: z.number().nonnegative().optional(),
  supportsToolCalls: z.boolean().default(false),
  supportsVision: z.boolean().default(false),
  supportsReasoning: z.boolean().default(false),
  inputModalities: z.array(MODALITY).default(['text']),
  outputModalities: z.array(MODALITY).default(['text']),
});

export type LocalModelInput = z.infer<typeof LocalModelInputSchema>;

export type DiscoveredModel = {
  id: string;
  name: string;
  contextWindow?: number;
  outputLimit?: number;
  supportsToolCalls?: boolean;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  inputModalities?: LocalModelInput['inputModalities'];
  outputModalities?: LocalModelInput['outputModalities'];
};

export async function getStoredBaseURL(provider: LocalProviderId): Promise<string | null> {
  const db = getDb();
  const [config] = await db
    .select({ credentials: providerConfig.credentials })
    .from(providerConfig)
    .where(eq(providerConfig.providerId, provider));
  return (config?.credentials as { baseURL?: string } | undefined)?.baseURL ?? null;
}

export async function listLocalModels(provider: LocalProviderId): Promise<LocalModel[]> {
  const db = getDb();
  return db.select().from(localModels).where(eq(localModels.provider, provider)).orderBy(localModels.createdAt);
}

export async function getLocalModel(provider: LocalProviderId, id: string): Promise<ServiceResult<LocalModel>> {
  const db = getDb();
  const [model] = await db
    .select()
    .from(localModels)
    .where(and(eq(localModels.provider, provider), eq(localModels.id, id)));
  if (!model) {
    return err('Model not found', 404);
  }
  return ok(model);
}

export async function upsertLocalModel(
  provider: LocalProviderId,
  input: LocalModelInput,
): Promise<ServiceResult<LocalModel>> {
  const parsed = LocalModelInputSchema.safeParse(input);
  if (!parsed.success) {
    return err('Invalid model data', 400, parsed.error.flatten());
  }

  const db = getDb();
  const now = Date.now();
  const [model] = await db
    .insert(localModels)
    .values({ ...parsed.data, provider, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [localModels.provider, localModels.id],
      set: {
        name: parsed.data.name,
        contextWindow: parsed.data.contextWindow,
        inputLimit: parsed.data.inputLimit,
        outputLimit: parsed.data.outputLimit,
        inputCostPerMillion: parsed.data.inputCostPerMillion,
        outputCostPerMillion: parsed.data.outputCostPerMillion,
        cacheReadCostPerMillion: parsed.data.cacheReadCostPerMillion,
        cacheWriteCostPerMillion: parsed.data.cacheWriteCostPerMillion,
        supportsToolCalls: parsed.data.supportsToolCalls,
        supportsVision: parsed.data.supportsVision,
        supportsReasoning: parsed.data.supportsReasoning,
        inputModalities: parsed.data.inputModalities,
        outputModalities: parsed.data.outputModalities,
        updatedAt: now,
      },
    })
    .returning();

  if (!model) {
    return err('Failed to save model', 500);
  }

  return ok(model);
}

export async function deleteLocalModel(provider: LocalProviderId, id: string): Promise<ServiceResult<null>> {
  const db = getDb();
  const result = await db
    .delete(localModels)
    .where(and(eq(localModels.provider, provider), eq(localModels.id, id)))
    .returning({ id: localModels.id });
  if (result.length === 0) {
    return err('Model not found', 404);
  }
  return ok(null);
}

export async function discoverModels(
  provider: LocalProviderId,
  baseURL: string,
): Promise<ServiceResult<DiscoveredModel[]>> {
  switch (provider) {
    case 'ollama_local':
      return discoverOllamaModels(baseURL);
    case 'lmstudio_local':
      return discoverLmStudioModels(baseURL);
  }
}

async function discoverOllamaModels(baseURL: string): Promise<ServiceResult<DiscoveredModel[]>> {
  const tagsUrl = `${baseURL}/api/tags`;

  const response = await fetch(tagsUrl, { signal: AbortSignal.timeout(5_000) }).catch(() => null);

  if (!response || !response.ok) {
    return err('Could not connect to Ollama. Make sure it is running.', 500);
  }

  const body = (await response.json()) as { models?: { name: string }[] };
  const modelNames = body.models ?? [];

  const enriched = await Promise.all(
    modelNames.map(async (m): Promise<DiscoveredModel | null> => {
      const showUrl = `${baseURL}/api/show`;
      const showResponse = await fetch(showUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m.name }),
        signal: AbortSignal.timeout(5_000),
      }).catch(() => null);

      if (!showResponse || !showResponse.ok) {
        return { id: m.name, name: m.name };
      }

      const showData = (await showResponse.json()) as {
        capabilities?: string[];
        model_info?: Record<string, unknown>;
        parameters?: string;
      };

      const capabilities = showData.capabilities ?? [];

      // Filter out embedding-only models
      if (capabilities.includes('embedding') && !capabilities.includes('completion')) {
        return null;
      }

      const modelInfo = showData.model_info ?? {};
      const arch = modelInfo['general.architecture'] as string | undefined;
      const archContextLength = arch ? (modelInfo[`${arch}.context_length`] as number | undefined) : undefined;

      // Prefer num_ctx from parameters (the configured runtime context) over the architecture max
      const numCtxMatch = showData.parameters?.match(/^num_ctx\s+(\d+)/m);
      const numCtx = numCtxMatch ? Number.parseInt(numCtxMatch[1], 10) : undefined;
      const contextLength = numCtx ?? archContextLength;

      const supportsToolCalls = capabilities.includes('tools');
      const supportsVision = capabilities.includes('vision');
      const supportsReasoning = capabilities.includes('thinking');

      const inputModalities: LocalModelInput['inputModalities'] = ['text'];
      if (supportsVision) inputModalities.push('image');

      return {
        id: m.name,
        name: m.name,
        contextWindow: contextLength ?? undefined,
        supportsToolCalls,
        supportsVision,
        supportsReasoning,
        inputModalities,
        outputModalities: ['text'],
      };
    }),
  );

  return ok(enriched.filter((m): m is DiscoveredModel => m !== null));
}

async function discoverLmStudioModels(baseURL: string): Promise<ServiceResult<DiscoveredModel[]>> {
  // Try v1 API first (LM Studio 0.4.0+)
  const v1Response = await fetch(`${baseURL}/api/v1/models`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);

  if (v1Response && v1Response.ok) {
    type LmStudioModel = {
      key?: string;
      id?: string;
      display_name?: string;
      max_context_length?: number;
      type?: string;
      loaded_instances?: Array<{ config?: { context_length?: number } }>;
      capabilities?: {
        vision?: boolean;
        trained_for_tool_use?: boolean;
        reasoning?: boolean | { allowed_options?: string[]; default?: string };
      };
    };

    const body = (await v1Response.json()) as { models?: LmStudioModel[]; data?: LmStudioModel[] };

    const models = (body.models ?? body.data ?? [])
      .filter((m) => m.type !== 'embedding' && m.type !== 'embeddings')
      .map((m): DiscoveredModel => {
        const supportsVision = m.capabilities?.vision ?? m.type === 'vlm';
        const supportsReasoning =
          typeof m.capabilities?.reasoning === 'boolean'
            ? m.capabilities.reasoning
            : m.capabilities?.reasoning !== undefined;
        const inputModalities: LocalModelInput['inputModalities'] = ['text'];
        if (supportsVision) inputModalities.push('image');

        // Prefer the loaded instance's actual context length over the theoretical max
        const loadedContext = m.loaded_instances?.[0]?.config?.context_length;
        const contextWindow = loadedContext ?? m.max_context_length ?? undefined;

        return {
          id: m.key ?? m.id ?? 'unknown',
          name: m.display_name ?? m.key ?? m.id ?? 'unknown',
          contextWindow,
          supportsToolCalls: m.capabilities?.trained_for_tool_use ?? false,
          supportsVision,
          supportsReasoning,
          inputModalities,
          outputModalities: ['text'],
        };
      });

    return ok(models);
  }

  // Fall back to v0 API
  const v0Response = await fetch(`${baseURL}/api/v0/models`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);

  if (!v0Response || !v0Response.ok) {
    return err('Could not connect to LM Studio. Make sure it is running.', 500);
  }

  const body = (await v0Response.json()) as {
    data?: Array<{ id?: string; type?: string; max_context_length?: number }>;
  };

  const models = (body.data ?? [])
    .filter((m) => m.type !== 'embedding' && m.type !== 'embeddings')
    .map((m): DiscoveredModel => {
      const supportsVision = m.type === 'vlm';
      const inputModalities: LocalModelInput['inputModalities'] = ['text'];
      if (supportsVision) inputModalities.push('image');

      return {
        id: m.id ?? 'unknown',
        name: m.id ?? 'unknown',
        contextWindow: m.max_context_length ?? undefined,
        supportsToolCalls: false,
        supportsVision,
        supportsReasoning: false,
        inputModalities,
        outputModalities: ['text'],
      };
    });

  return ok(models);
}

export async function checkHealth(provider: LocalProviderId, baseURL: string): Promise<boolean> {
  switch (provider) {
    case 'ollama_local': {
      const response = await fetch(`${baseURL}/api/version`, { signal: AbortSignal.timeout(2_000) }).catch(() => null);
      return response !== null && response.ok;
    }
    case 'lmstudio_local': {
      const v1 = await fetch(`${baseURL}/api/v1/models`, { signal: AbortSignal.timeout(2_000) }).catch(() => null);
      if (v1 && v1.ok) return true;
      const v0 = await fetch(`${baseURL}/api/v0/models`, { signal: AbortSignal.timeout(2_000) }).catch(() => null);
      return v0 !== null && v0.ok;
    }
  }
}
