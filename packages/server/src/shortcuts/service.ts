import { eq } from 'drizzle-orm';

import { SHORTCUT_ACTION_IDS, SHORTCUT_DEFAULTS } from '@stitch/shared/shortcuts/types';
import type { ShortcutActionId, ShortcutCategory } from '@stitch/shared/shortcuts/types';

import { getDb } from '@/db/client.js';
import { keyboardShortcuts } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

interface ShortcutRow {
  actionId: string;
  hotkey: string | null;
  isSequence: boolean;
  label: string;
  category: ShortcutCategory;
}

const ALLOWED_ACTION_IDS: ReadonlySet<string> = new Set(SHORTCUT_ACTION_IDS);

function isAllowedActionId(actionId: string): boolean {
  return ALLOWED_ACTION_IDS.has(actionId);
}

export async function listShortcuts(): Promise<ShortcutRow[]> {
  const db = getDb();
  const rows = await db.select().from(keyboardShortcuts);
  return rows.map((row) => ({
    actionId: row.actionId,
    hotkey: row.hotkey,
    isSequence: row.isSequence,
    label: row.label,
    category: row.category,
  }));
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

  const hotkey = hotkeyValue ?? null;
  const db = getDb();
  await db
    .update(keyboardShortcuts)
    .set({ hotkey, updatedAt: Date.now() })
    .where(eq(keyboardShortcuts.actionId, actionId as ShortcutActionId));

  return ok(null);
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

export async function deleteShortcut(actionId: string): Promise<ServiceResult<null>> {
  if (!isAllowedActionId(actionId)) {
    return err('Invalid action ID', 400);
  }

  const db = getDb();
  await db
    .update(keyboardShortcuts)
    .set({ hotkey: null, updatedAt: Date.now() })
    .where(eq(keyboardShortcuts.actionId, actionId as ShortcutActionId));

  return ok(null);
}
