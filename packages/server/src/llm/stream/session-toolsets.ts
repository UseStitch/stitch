import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb, isDbInitialized } from '@/db/client.js';
import { sessions } from '@/db/schema.js';

// Fallback used only when DB is not initialized (e.g. unit tests).
const inMemoryFallback = new Map<string, string[]>();

export function getSessionActiveToolsetIds(sessionId: PrefixedString<'ses'>): string[] {
  if (!isDbInitialized()) return inMemoryFallback.get(sessionId) ?? [];
  const row = getDb()
    .select({ activeToolsetIds: sessions.activeToolsetIds })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  return row?.activeToolsetIds ?? [];
}

export function setSessionActiveToolsetIds(
  sessionId: PrefixedString<'ses'>,
  toolsetIds: Iterable<string>,
): void {
  const ids = [...toolsetIds];
  if (!isDbInitialized()) {
    if (ids.length === 0) {
      inMemoryFallback.delete(sessionId);
    } else {
      inMemoryFallback.set(sessionId, ids);
    }
    return;
  }
  getDb()
    .update(sessions)
    .set({ activeToolsetIds: ids, updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId))
    .run();
}
