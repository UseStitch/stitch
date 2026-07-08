import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { connectors } from '@/db/schema/connectors.js';

type OAuthCredentialCarrier = { connectorRefId: PrefixedString<'cnr'> };

export async function resolveOAuthCredentials(
  instance: OAuthCredentialCarrier,
): Promise<{ clientId: string; clientSecret: string } | null> {
  const db = getDb();
  const [connector] = await db.select().from(connectors).where(eq(connectors.id, instance.connectorRefId));
  if (connector?.clientId && connector.clientSecret) {
    return { clientId: connector.clientId, clientSecret: connector.clientSecret };
  }
  return null;
}
