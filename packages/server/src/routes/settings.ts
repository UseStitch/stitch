import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { SETTINGS_KEYS, userSettings, type SettingsKey } from '../db/schema.js';

const ALLOWED_KEYS: ReadonlySet<string> = new Set(SETTINGS_KEYS);

export const settingsRouter = new Hono();

settingsRouter.get('/', async (c) => {
  const db = getDb();
  const rows = await db.select().from(userSettings);
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return c.json(result);
});

settingsRouter.put('/:key', async (c) => {
  const key = c.req.param('key');
  if (!ALLOWED_KEYS.has(key)) {
    return c.json({ error: 'Invalid setting key' }, 400);
  }
  const body = (await c.req.json()) as { value?: unknown };
  if (typeof body.value !== 'string' || body.value.length === 0) {
    return c.json({ error: 'Invalid value' }, 400);
  }
  const db = getDb();
  await db
    .insert(userSettings)
    .values({ key: key as SettingsKey, value: body.value })
    .onConflictDoUpdate({
      target: userSettings.key,
      set: { value: body.value, updatedAt: new Date() },
    });
  return c.body(null, 204);
});

settingsRouter.delete('/:key', async (c) => {
  const key = c.req.param('key');
  if (!ALLOWED_KEYS.has(key)) {
    return c.json({ error: 'Invalid setting key' }, 400);
  }
  const db = getDb();
  const result = await db
    .delete(userSettings)
    .where(eq(userSettings.key, key as SettingsKey))
    .returning({ key: userSettings.key });
  if (result.length === 0) return c.json({ error: 'Setting not found' }, 404);
  return c.body(null, 204);
});
