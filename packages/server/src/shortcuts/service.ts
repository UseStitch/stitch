import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { SHORTCUT_ACTION_IDS, SHORTCUT_DEFAULTS } from '@stitch/shared/shortcuts/types';
import type { ShortcutActionId } from '@stitch/shared/shortcuts/types';

import { getDb } from '@/db/client.js';
import { keyboardShortcuts } from '@/db/schema/settings.js';

const ALLOWED_ACTION_IDS: ReadonlySet<string> = new Set(SHORTCUT_ACTION_IDS);

function isAllowedActionId(actionId: string): boolean {
  return ALLOWED_ACTION_IDS.has(actionId);
}

export async function listShortcuts(): Promise<Array<typeof keyboardShortcuts.$inferSelect>> {
  const db = getDb();
  return db.select().from(keyboardShortcuts);
}

export async function saveShortcut(actionId: string, hotkeyValue: unknown): Promise<void> {
  if (!isAllowedActionId(actionId)) {
    throw new HTTPException(400, { message: 'Invalid action ID' });
  }
  if (hotkeyValue !== null && typeof hotkeyValue !== 'string') {
    throw new HTTPException(400, { message: 'hotkey must be a string or null' });
  }

  const hotkey = hotkeyValue ?? null;
  const db = getDb();
  await db
    .update(keyboardShortcuts)
    .set({ hotkey, updatedAt: Date.now() })
    .where(eq(keyboardShortcuts.actionId, actionId as ShortcutActionId));
}

export async function resetShortcuts(): Promise<void> {
  const db = getDb();
  const now = Date.now();
  for (const def of SHORTCUT_DEFAULTS) {
    await db
      .update(keyboardShortcuts)
      .set({ hotkey: def.hotkey, isSequence: def.isSequence, updatedAt: now })
      .where(eq(keyboardShortcuts.actionId, def.actionId));
  }
}

export async function deleteShortcut(actionId: string): Promise<void> {
  if (!isAllowedActionId(actionId)) {
    throw new HTTPException(400, { message: 'Invalid action ID' });
  }

  const db = getDb();
  await db
    .update(keyboardShortcuts)
    .set({ hotkey: null, updatedAt: Date.now() })
    .where(eq(keyboardShortcuts.actionId, actionId as ShortcutActionId));
}
