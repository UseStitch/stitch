import { eq } from 'drizzle-orm';

import { SETTINGS_KEYS } from '@openwork/shared/settings/types';
import type { PrefixedString } from '@openwork/shared/id';
import type { SettingsKey } from '@openwork/shared/settings/types';

import { getDb } from '@/db/client.js';
import { agents, userSettings } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

const ALLOWED_KEYS: ReadonlySet<string> = new Set(SETTINGS_KEYS);
const ONBOARDING_STATUSES = new Set(['pending', 'completed']);
const BOOLEAN_SETTING_VALUES = new Set(['true', 'false']);

export async function listSettings(): Promise<Record<string, string>> {
  const db = getDb();
  const rows = await db.select().from(userSettings);
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export async function saveSetting(key: string, value: unknown): Promise<ServiceResult<null>> {
  if (!ALLOWED_KEYS.has(key)) {
    return err('Invalid setting key', 400);
  }
  if (typeof value !== 'string' || value.length === 0) {
    return err('Invalid value', 400);
  }
  if (key === 'onboarding.status' && !ONBOARDING_STATUSES.has(value)) {
    return err('Invalid onboarding status', 400);
  }
  if ((key === 'compaction.auto' || key === 'compaction.prune') && !BOOLEAN_SETTING_VALUES.has(value)) {
    return err('Invalid boolean setting value', 400);
  }
  if (key === 'compaction.reserved') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return err('Invalid compaction reserved value', 400);
    }
  }

  const db = getDb();
  if (key === 'agent.default') {
    const [agent] = await db
      .select()
      .from(agents)
    .where(eq(agents.id, value as PrefixedString<'agt'>));
    if (!agent || agent.type !== 'primary') {
      return err('Invalid primary agent id', 400);
    }
  }

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
  if (!ALLOWED_KEYS.has(key)) {
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
