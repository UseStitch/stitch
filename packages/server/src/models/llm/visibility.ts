import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { getDb } from '@/db/client.js';
import { modelVisibility } from '@/db/schema/providers.js';

type VisibilityOverride = { providerId: string; modelId: string; visibility: 'show' | 'hide' };

export async function listVisibilityOverrides(): Promise<VisibilityOverride[]> {
  const db = getDb();
  return db.select().from(modelVisibility);
}

export async function upsertVisibility(
  providerId: string,
  modelId: string,
  visibility: 'show' | 'hide',
): Promise<void> {
  const db = getDb();
  await db
    .insert(modelVisibility)
    .values({ providerId, modelId, visibility, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: [modelVisibility.providerId, modelVisibility.modelId],
      set: { visibility, updatedAt: Date.now() },
    });
}

export async function deleteVisibility(providerId: string, modelId: string): Promise<void> {
  const db = getDb();
  const deleted = await db
    .delete(modelVisibility)
    .where(and(eq(modelVisibility.providerId, providerId), eq(modelVisibility.modelId, modelId)))
    .returning({ providerId: modelVisibility.providerId });

  if (deleted.length === 0) {
    throw new HTTPException(404, { message: 'Visibility override not found' });
  }
}
