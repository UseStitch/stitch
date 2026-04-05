import { and, eq } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { modelVisibility } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

type VisibilityOverride = {
  providerId: string;
  modelId: string;
  visibility: 'show' | 'hide';
};

export async function listVisibilityOverrides(): Promise<VisibilityOverride[]> {
  const db = getDb();
  return db.select().from(modelVisibility);
}

export async function upsertVisibility(
  providerId: string,
  modelId: string,
  visibility: 'show' | 'hide',
): Promise<ServiceResult<null>> {
  const db = getDb();
  await db
    .insert(modelVisibility)
    .values({ providerId, modelId, visibility, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: [modelVisibility.providerId, modelVisibility.modelId],
      set: { visibility, updatedAt: Date.now() },
    });
  return ok(null);
}

export async function deleteVisibility(
  providerId: string,
  modelId: string,
): Promise<ServiceResult<null>> {
  const db = getDb();
  const deleted = await db
    .delete(modelVisibility)
    .where(and(eq(modelVisibility.providerId, providerId), eq(modelVisibility.modelId, modelId)))
    .returning({ providerId: modelVisibility.providerId });

  if (deleted.length === 0) {
    return err('Visibility override not found', 404);
  }
  return ok(null);
}
