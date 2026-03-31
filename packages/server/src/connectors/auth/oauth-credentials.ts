import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { connectorOAuthProfiles } from '@/db/schema.js';

type OAuthCredentialCarrier = {
  oauthProfileId: PrefixedString<'connp'> | null;
  clientId: string | null;
  clientSecret: string | null;
};

export async function resolveOAuthCredentials(
  instance: OAuthCredentialCarrier,
): Promise<{ clientId: string; clientSecret: string } | null> {
  if (instance.clientId && instance.clientSecret) {
    return { clientId: instance.clientId, clientSecret: instance.clientSecret };
  }

  if (!instance.oauthProfileId) {
    return null;
  }

  const db = getDb();
  const [profile] = await db
    .select({
      clientId: connectorOAuthProfiles.clientId,
      clientSecret: connectorOAuthProfiles.clientSecret,
    })
    .from(connectorOAuthProfiles)
    .where(eq(connectorOAuthProfiles.id, instance.oauthProfileId));

  if (!profile?.clientId || !profile.clientSecret) {
    return null;
  }

  return {
    clientId: profile.clientId,
    clientSecret: profile.clientSecret,
  };
}
