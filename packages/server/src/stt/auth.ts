import { eq } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { providerConfig } from '@/db/schema/providers.js';
import type { ProviderAuth } from '@/stt/types.js';

/**
 * Resolves STT provider credentials from the existing provider auth system.
 * Maps stored credentials -> the adapter's ProviderAuth shape.
 */
export async function resolveSttAuth(providerId: string): Promise<ProviderAuth | null> {
  const db = getDb();
  const [config] = await db
    .select()
    .from(providerConfig)
    .where(eq(providerConfig.providerId, providerId));

  if (!config) return null;

  const credentials = config.credentials as Record<string, unknown>;
  const auth = credentials['auth'] as Record<string, unknown> | undefined;

  if (!auth) return null;

  switch (providerId) {
    case 'openai': {
      const apiKey = (auth as { apiKey?: string }).apiKey;
      if (!apiKey) return null;
      return { kind: 'apiKey', key: apiKey };
    }
    case 'elevenlabs': {
      const apiKey = (auth as { apiKey?: string }).apiKey;
      if (!apiKey) return null;
      return { kind: 'apiKey', key: apiKey };
    }
    default:
      return null;
  }
}
