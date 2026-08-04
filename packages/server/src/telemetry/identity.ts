import { eq } from 'drizzle-orm';

import { createTelemetryServerId, ID_PREFIXES, isIdOfType } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { userSettings } from '@/db/schema/settings.js';

const SETTING_KEY = 'telemetry.serverId';
let cachedServerId: string | null = null;

export function initServerInstallationId(): string {
  if (cachedServerId) return cachedServerId;

  const db = getDb();
  const existing = db
    .select({ value: userSettings.value })
    .from(userSettings)
    .where(eq(userSettings.key, SETTING_KEY))
    .get();

  if (existing && isIdOfType(existing.value, ID_PREFIXES.telemetryServer)) {
    cachedServerId = existing.value;
    return cachedServerId;
  }

  const newId = createTelemetryServerId();
  db.insert(userSettings)
    .values({ key: SETTING_KEY, value: newId, description: 'Anonymous server installation identifier for telemetry.' })
    .onConflictDoNothing()
    .run();

  // Re-read in case of concurrent insert
  const persisted = db
    .select({ value: userSettings.value })
    .from(userSettings)
    .where(eq(userSettings.key, SETTING_KEY))
    .get();

  cachedServerId = persisted && isIdOfType(persisted.value, ID_PREFIXES.telemetryServer) ? persisted.value : newId;
  return cachedServerId;
}

export function getServerInstallationId(): string {
  if (!cachedServerId) throw new Error('Server installation ID not initialized.');
  return cachedServerId;
}
