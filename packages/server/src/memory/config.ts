import { inArray } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { userSettings } from '@/db/schema.js';

type MemoryConfig = {
  enabled: boolean;
  autoExtract: boolean;
  embeddingProviderId: string;
  embeddingModelId: string;
};

const MEMORY_SETTING_KEYS = [
  'memory.enabled',
  'memory.autoExtract',
  'memory.embedding.providerId',
  'memory.embedding.modelId',
] as const;

export async function getMemoryConfig(): Promise<MemoryConfig> {
  const db = getDb();
  const rows = await db
    .select({ key: userSettings.key, value: userSettings.value })
    .from(userSettings)
    .where(inArray(userSettings.key, [...MEMORY_SETTING_KEYS]));

  const byKey = new Map(rows.map((r) => [r.key, r.value.trim()]));

  return {
    enabled: byKey.get('memory.enabled') === 'true',
    autoExtract: byKey.get('memory.autoExtract') !== 'false',
    embeddingProviderId: byKey.get('memory.embedding.providerId') ?? '',
    embeddingModelId: byKey.get('memory.embedding.modelId') ?? '',
  };
}
