import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@/db/client.js';
import { ollamaModels } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

export type OllamaModel = typeof ollamaModels.$inferSelect;

export const OllamaModelInputSchema = z.object({
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
});

type OllamaModelInput = z.infer<typeof OllamaModelInputSchema>;

type DiscoveredModel = {
  id: string;
  name: string;
};

export async function listOllamaModels(): Promise<OllamaModel[]> {
  const db = getDb();
  return db.select().from(ollamaModels).orderBy(ollamaModels.createdAt);
}

export async function getOllamaModel(id: string): Promise<ServiceResult<OllamaModel>> {
  const db = getDb();
  const [model] = await db.select().from(ollamaModels).where(eq(ollamaModels.id, id));
  if (!model) {
    return err('Model not found', 404);
  }
  return ok(model);
}

export async function upsertOllamaModel(
  input: OllamaModelInput,
): Promise<ServiceResult<OllamaModel>> {
  const parsed = OllamaModelInputSchema.safeParse(input);
  if (!parsed.success) {
    return err('Invalid model data', 400, parsed.error.flatten());
  }

  const db = getDb();
  const now = Date.now();
  const [model] = await db
    .insert(ollamaModels)
    .values({ ...parsed.data, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: ollamaModels.id,
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
        updatedAt: now,
      },
    })
    .returning();

  if (!model) {
    return err('Failed to save model', 500);
  }

  return ok(model);
}

export async function deleteOllamaModel(id: string): Promise<ServiceResult<null>> {
  const db = getDb();
  const result = await db
    .delete(ollamaModels)
    .where(eq(ollamaModels.id, id))
    .returning({ id: ollamaModels.id });
  if (result.length === 0) {
    return err('Model not found', 404);
  }
  return ok(null);
}

export async function discoverOllamaModels(
  baseURL: string,
): Promise<ServiceResult<DiscoveredModel[]>> {
  const tagsUrl = `${baseURL}/api/tags`;

  const response = await fetch(tagsUrl, {
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);

  if (!response || !response.ok) {
    return err('Could not connect to Ollama. Make sure it is running.', 500);
  }

  const body = (await response.json()) as { models?: { name: string }[] };
  const models = (body.models ?? []).map((m) => ({
    id: m.name,
    name: m.name,
  }));

  return ok(models);
}
