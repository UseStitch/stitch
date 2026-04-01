import { eq } from 'drizzle-orm';

import { SETTINGS_SCHEMAS } from '@stitch/shared/settings/types';
import type { SettingsKey } from '@stitch/shared/settings/types';

import { getDb } from '@/db/client.js';
import { userSettings } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

export async function listSettings(): Promise<Record<string, string>> {
  const db = getDb();
  const rows = await db.select().from(userSettings);
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export async function saveSetting(key: string, value: string): Promise<ServiceResult<null>> {
  const schema = SETTINGS_SCHEMAS[key as SettingsKey];
  if (!schema) {
    return err('Invalid setting key', 400);
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    return err(`Invalid value: ${issue.message}`, 400);
  }

  const db = getDb();
  await db
    .insert(userSettings)
    .values({ key: key as SettingsKey, value })
    .onConflictDoUpdate({
      target: userSettings.key,
      set: { value, updatedAt: Date.now() },
    });

  return ok(null);
}

export async function deleteSetting(key: string): Promise<ServiceResult<null>> {
  if (!(key in SETTINGS_SCHEMAS)) {
    return err('Invalid setting key', 400);
  }

  const db = getDb();
  const result = await db
    .delete(userSettings)
    .where(eq(userSettings.key, key as SettingsKey))
    .returning({ key: userSettings.key });
  if (result.length === 0) {
    return err('Setting not found', 404);
  }

  return ok(null);
}
