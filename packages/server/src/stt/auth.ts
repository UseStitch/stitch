import { eq } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { providerConfig } from '@/db/schema/providers.js';
import { ProviderCredentialsSchema } from '@/provider/config/schema.js';
import type { ProviderAuth } from '@/stt/types.js';

/**
 * Resolves STT provider credentials from the existing provider auth system.
 * Parses stored credentials through the shared schema to extract the API key —
 * no per-provider switch required; the schema shape determines the auth kind.
 */
export async function resolveSttAuth(providerId: string): Promise<ProviderAuth | null> {
  const db = getDb();
  const [config] = await db
    .select()
    .from(providerConfig)
    .where(eq(providerConfig.providerId, providerId));

  if (!config) return null;

  const parsed = ProviderCredentialsSchema.safeParse(config.credentials);
  if (!parsed.success) return null;

  const { auth } = parsed.data;
  if ('apiKey' in auth) return { kind: 'apiKey', key: auth.apiKey };

  return null;
}
