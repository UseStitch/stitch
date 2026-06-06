import { like } from 'drizzle-orm';

import { getDb, isDbInitialized } from '@/db/client.js';
import { userSettings } from '@/db/schema.js';
import type { SessionToolsetScope } from '@/llm/stream/session-toolsets.js';

type ToolsetSettings = {
  defaultScope: SessionToolsetScope;
  ttlTurns: number;
};

export const DEFAULT_TOOLSET_SETTINGS: ToolsetSettings = {
  defaultScope: 'ttl_turns',
  ttlTurns: 3,
};

function parseDefaultScope(value: string | undefined): SessionToolsetScope | undefined {
  if (value === 'current_run' || value === 'ttl_turns' || value === 'until_deactivated') {
    return value;
  }
  return undefined;
}

function parseTtlTurns(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : undefined;
}

export function parseToolsetSettings(values: Map<string, string>): ToolsetSettings {
  return {
    defaultScope: parseDefaultScope(values.get('toolsets.defaultScope')) ?? DEFAULT_TOOLSET_SETTINGS.defaultScope,
    ttlTurns: parseTtlTurns(values.get('toolsets.ttlTurns')) ?? DEFAULT_TOOLSET_SETTINGS.ttlTurns,
  };
}

export async function getToolsetSettings(): Promise<ToolsetSettings> {
  if (!isDbInitialized()) return DEFAULT_TOOLSET_SETTINGS;

  const rows = await getDb()
    .select({ key: userSettings.key, value: userSettings.value })
    .from(userSettings)
    .where(like(userSettings.key, 'toolsets.%'));

  return parseToolsetSettings(new Map(rows.map((row) => [row.key, row.value])));
}
