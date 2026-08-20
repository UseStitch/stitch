import { eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { SETTINGS_DEFAULTS, SETTINGS_SCHEMAS } from '@stitch/shared/settings/types';
import type { SettingsKey } from '@stitch/shared/settings/types';

import { getDb } from '@/db/client.js';
import { userSettings } from '@/db/schema/settings.js';
import { internalBus } from '@/lib/internal-bus.js';
import type { z } from 'zod';

type SettingValue<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;

type SettingsMap<Keys extends readonly SettingsKey[]> = {
  [K in Keys[number]]: SettingValue<K>;
};

const defaultsByKey = new Map<SettingsKey, string>(SETTINGS_DEFAULTS.map((d) => [d.key, d.value]));

/**
 * Read and parse a set of settings keys in one query.
 * Each value is parsed via its SETTINGS_SCHEMAS entry; missing rows fall back
 * to SETTINGS_DEFAULTS. The return type is inferred from the input key tuple.
 */
export async function getSettings<const Keys extends readonly SettingsKey[]>(keys: Keys): Promise<SettingsMap<Keys>> {
  const db = getDb();
  const rows = await db
    .select({ key: userSettings.key, value: userSettings.value })
    .from(userSettings)
    .where(inArray(userSettings.key, [...keys]));

  const rawByKey = new Map(rows.map((r) => [r.key, r.value]));

  const result = {} as SettingsMap<Keys>;
  for (const key of keys) {
    const raw = rawByKey.get(key) ?? defaultsByKey.get(key) ?? '';
    const parsed = SETTINGS_SCHEMAS[key].safeParse(raw);
    (result as Record<string, unknown>)[key] = parsed.success
      ? parsed.data
      : SETTINGS_SCHEMAS[key].parse(defaultsByKey.get(key) ?? '');
  }

  return result;
}

export async function listSettings(): Promise<Record<string, string>> {
  const db = getDb();
  const rows = await db.select().from(userSettings);
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export async function saveSetting(key: string, value: string): Promise<void> {
  const schema = SETTINGS_SCHEMAS[key as SettingsKey] as (typeof SETTINGS_SCHEMAS)[SettingsKey] | undefined;
  if (!schema) {
    throw new HTTPException(400, { message: 'Invalid setting key' });
  }

  const parseResult = schema.safeParse(value);
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0];
    throw new HTTPException(400, { message: `Invalid value: ${issue.message}` });
  }

  const db = getDb();
  await db
    .insert(userSettings)
    .values({ key: key as SettingsKey, value })
    .onConflictDoUpdate({ target: userSettings.key, set: { value, updatedAt: Date.now() } });

  internalBus.emit('settings.changed', { key: key as SettingsKey });
}

export async function deleteSetting(key: string): Promise<void> {
  if (!(key in SETTINGS_SCHEMAS)) {
    throw new HTTPException(400, { message: 'Invalid setting key' });
  }

  const db = getDb();
  const result = await db
    .delete(userSettings)
    .where(eq(userSettings.key, key as SettingsKey))
    .returning({ key: userSettings.key });
  if (result.length === 0) {
    throw new HTTPException(404, { message: 'Setting not found' });
  }

  internalBus.emit('settings.changed', { key: key as SettingsKey });
}
