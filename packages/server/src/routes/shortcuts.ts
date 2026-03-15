import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { SHORTCUT_ACTION_IDS } from '@openwork/shared';
import type { ShortcutActionId } from '@openwork/shared';

import { getDb } from '../db/client.js';
import { keyboardShortcuts } from '../db/schema.js';

const ALLOWED_ACTION_IDS: ReadonlySet<string> = new Set(SHORTCUT_ACTION_IDS);

export const shortcutsRouter = new Hono();

shortcutsRouter.get('/', async (c) => {
  const db = getDb();
  const rows = await db.select().from(keyboardShortcuts);
  const result: Record<string, string | null> = {};
  for (const row of rows) {
    result[row.actionId] = row.hotkey;
  }
  return c.json(result);
});

shortcutsRouter.put('/:actionId', async (c) => {
  const actionId = c.req.param('actionId');
  if (!ALLOWED_ACTION_IDS.has(actionId)) {
    return c.json({ error: 'Invalid action ID' }, 400);
  }
  const body = (await c.req.json()) as { hotkey?: unknown };
  if (body.hotkey !== null && typeof body.hotkey !== 'string') {
    return c.json({ error: 'hotkey must be a string or null' }, 400);
  }
  const hotkey = (body.hotkey as string | null) ?? null;
  const db = getDb();
  await db
    .insert(keyboardShortcuts)
    .values({ actionId: actionId as ShortcutActionId, hotkey, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: keyboardShortcuts.actionId,
      set: { hotkey, updatedAt: new Date() },
    });
  return c.body(null, 204);
});

shortcutsRouter.delete('/', async (c) => {
  const db = getDb();
  await db.delete(keyboardShortcuts);
  return c.body(null, 204);
});

shortcutsRouter.delete('/:actionId', async (c) => {
  const actionId = c.req.param('actionId');
  if (!ALLOWED_ACTION_IDS.has(actionId)) {
    return c.json({ error: 'Invalid action ID' }, 400);
  }
  const db = getDb();
  const result = await db
    .delete(keyboardShortcuts)
    .where(eq(keyboardShortcuts.actionId, actionId as ShortcutActionId))
    .returning({ actionId: keyboardShortcuts.actionId });
  if (result.length === 0) return c.json({ error: 'Shortcut override not found' }, 404);
  return c.body(null, 204);
});
