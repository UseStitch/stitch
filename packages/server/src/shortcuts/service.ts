import { eq } from 'drizzle-orm';

import { SHORTCUT_ACTION_IDS } from '@openwork/shared';
import type { ShortcutActionId } from '@openwork/shared';

import { getDb } from '@/db/client.js';
import { keyboardShortcuts } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

const ALLOWED_ACTION_IDS: ReadonlySet<string> = new Set(SHORTCUT_ACTION_IDS);

function isAllowedActionId(actionId: string): boolean {
  return ALLOWED_ACTION_IDS.has(actionId);
}

export async function listShortcuts(): Promise<Record<string, string | null>> {
  const db = getDb();
  const rows = await db.select().from(keyboardShortcuts);
  const result: Record<string, string | null> = {};
  for (const row of rows) {
    result[row.actionId] = row.hotkey;
  }
  return result;
}

export async function saveShortcut(
  actionId: string,
  hotkeyValue: unknown,
): Promise<ServiceResult<null>> {
  if (!isAllowedActionId(actionId)) {
    return err('Invalid action ID', 400);
  }
  if (hotkeyValue !== null && typeof hotkeyValue !== 'string') {
    return err('hotkey must be a string or null', 400);
  }

  const hotkey = (hotkeyValue as string | null) ?? null;
  const db = getDb();
  await db
    .insert(keyboardShortcuts)
    .values({ actionId: actionId as ShortcutActionId, hotkey, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: keyboardShortcuts.actionId,
      set: { hotkey, updatedAt: Date.now() },
    });

  return ok(null);
}

export async function clearShortcuts(): Promise<void> {
  const db = getDb();
  await db.delete(keyboardShortcuts);
}

export async function deleteShortcut(actionId: string): Promise<ServiceResult<null>> {
  if (!isAllowedActionId(actionId)) {
    return err('Invalid action ID', 400);
  }

  const db = getDb();
  const result = await db
    .delete(keyboardShortcuts)
    .where(eq(keyboardShortcuts.actionId, actionId as ShortcutActionId))
    .returning({ actionId: keyboardShortcuts.actionId });
  if (result.length === 0) {
    return err('Shortcut override not found', 404);
  }

  return ok(null);
}
