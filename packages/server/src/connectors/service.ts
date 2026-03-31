import { asc, eq } from 'drizzle-orm';

import { createConnectorInstanceId } from '@stitch/shared/id';
import { createConnectorOAuthProfileId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type {
  ConnectorInstance,
  ConnectorInstanceSafe,
  ConnectorOAuthProfile,
  ConnectorStatus,
  OAuthConfig,
} from '@stitch/shared/connectors/types';

import { getDb } from '@/db/client.js';
import { connectorInstances, connectorOAuthProfiles } from '@/db/schema.js';
import { getConnectorDefinition } from '@/connectors/registry.js';
import { startOAuthFlow } from '@/connectors/auth/oauth2.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'connectors' });

function toSafe(instance: ConnectorInstance): ConnectorInstanceSafe {
  const { clientSecret, accessToken, refreshToken, apiKey, ...rest } = instance;
  return {
    ...rest,
    hasClientSecret: clientSecret !== null && clientSecret !== '',
    hasAccessToken: accessToken !== null && accessToken !== '',
    hasRefreshToken: refreshToken !== null && refreshToken !== '',
    hasApiKey: apiKey !== null && apiKey !== '',
  };
}

type ConnectorOAuthProfileRow = ConnectorOAuthProfile & {
  clientSecret: string;
};

function toSafeOAuthProfile(profile: ConnectorOAuthProfileRow): ConnectorOAuthProfile {
  const { clientSecret, ...rest } = profile;
  return {
    ...rest,
    hasClientSecret: clientSecret.trim().length > 0,
  };
}

export async function listConnectorInstances(): Promise<ConnectorInstanceSafe[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(connectorInstances)
    .orderBy(asc(connectorInstances.createdAt));
  return rows.map((r) => toSafe(r as ConnectorInstance));
}

export async function getConnectorInstance(
  id: string,
): Promise<ServiceResult<ConnectorInstanceSafe>> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(connectorInstances)
    .where(eq(connectorInstances.id, id as PrefixedString<'conn'>));

  if (!row) return err('Connector instance not found', 404);
  return ok(toSafe(row as ConnectorInstance));
}

export async function createOAuthConnectorInstance(input: {
  connectorId: string;
  label: string;
  oauthProfileId?: string;
  clientId?: string;
  clientSecret?: string;
  scopes: string[];
}): Promise<ServiceResult<ConnectorInstanceSafe>> {
  const definition = getConnectorDefinition(input.connectorId);
  if (!definition) return err('Unknown connector type', 400);
  if (definition.authType !== 'oauth2') return err('Connector does not use OAuth2', 400);

  const db = getDb();
  const id = createConnectorInstanceId();

  let oauthProfileId: PrefixedString<'connp'> | null = null;
  let clientId: string | null = null;
  let clientSecret: string | null = null;

  if (input.oauthProfileId) {
    const [profile] = await db
      .select()
      .from(connectorOAuthProfiles)
      .where(eq(connectorOAuthProfiles.id, input.oauthProfileId as PrefixedString<'connp'>));

    if (!profile) return err('OAuth profile not found', 404);
    if (profile.connectorId !== input.connectorId) {
      return err('OAuth profile connector mismatch', 400);
    }

    oauthProfileId = profile.id;
    clientId = profile.clientId;
    clientSecret = profile.clientSecret;
  } else {
    if (!input.clientId || !input.clientSecret) {
      return err('OAuth profile or client credentials are required', 400);
    }

    clientId = input.clientId;
    clientSecret = input.clientSecret;
  }

  const instance = {
    id,
    connectorId: input.connectorId,
    label: input.label,
    oauthProfileId,
    clientId,
    clientSecret,
    apiKey: null,
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: null,
    scopes: input.scopes,
    status: 'awaiting_auth' as ConnectorStatus,
    accountEmail: null,
    accountInfo: null,
  };

  await db.insert(connectorInstances).values(instance);

  log.info(
    { event: 'connector.created', instanceId: id, connectorId: input.connectorId },
    `Connector instance created: ${input.label}`,
  );

  const [row] = await db
    .select()
    .from(connectorInstances)
    .where(eq(connectorInstances.id, id));
  return ok(toSafe(row as ConnectorInstance));
}

export async function createApiKeyConnectorInstance(input: {
  connectorId: string;
  label: string;
  apiKey: string;
}): Promise<ServiceResult<ConnectorInstanceSafe>> {
  const definition = getConnectorDefinition(input.connectorId);
  if (!definition) return err('Unknown connector type', 400);
  if (definition.authType !== 'api_key') return err('Connector does not use API key', 400);

  const db = getDb();
  const id = createConnectorInstanceId();

  const instance = {
    id,
    connectorId: input.connectorId,
    label: input.label,
    oauthProfileId: null,
    clientId: null,
    clientSecret: null,
    apiKey: input.apiKey,
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: null,
    scopes: null,
    status: 'connected' as ConnectorStatus,
    accountEmail: null,
    accountInfo: null,
  };

  await db.insert(connectorInstances).values(instance);

  log.info(
    { event: 'connector.created', instanceId: id, connectorId: input.connectorId },
    `API key connector instance created: ${input.label}`,
  );

  const [row] = await db
    .select()
    .from(connectorInstances)
    .where(eq(connectorInstances.id, id));
  return ok(toSafe(row as ConnectorInstance));
}

export async function authorizeOAuthInstance(
  instanceId: string,
): Promise<ServiceResult<{ authUrl: string; waitForTokens: () => Promise<void> }>> {
  const db = getDb();
  const [instance] = await db
    .select()
    .from(connectorInstances)
    .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));

  if (!instance) return err('Connector instance not found', 404);

  const definition = getConnectorDefinition(instance.connectorId);
  if (!definition || definition.authType !== 'oauth2') {
    return err('Connector does not use OAuth2', 400);
  }

  if (!instance.clientId || !instance.clientSecret) {
    if (!instance.oauthProfileId) {
      return err('OAuth credentials not configured', 400);
    }

    const [profile] = await db
      .select()
      .from(connectorOAuthProfiles)
      .where(eq(connectorOAuthProfiles.id, instance.oauthProfileId));

    if (!profile) return err('OAuth profile not found', 404);

    instance.clientId = profile.clientId;
    instance.clientSecret = profile.clientSecret;
  }

  const config = definition.authConfig as OAuthConfig;
  const scopes = (instance.scopes as string[]) ?? config.defaultScopes;

  const { authUrl, waitForTokens } = await startOAuthFlow(
    config,
    instance.clientId,
    instance.clientSecret,
    scopes,
  );

  const tokenHandler = async (): Promise<void> => {
    const tokens = await waitForTokens();
    const now = Date.now();

    // Fetch account info for Google
    let accountEmail: string | null = null;
    let accountInfo: Record<string, unknown> | null = null;

    if (instance.connectorId === 'google') {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (res.ok) {
          const info = (await res.json()) as { email?: string; name?: string; picture?: string };
          accountEmail = info.email ?? null;
          accountInfo = info as Record<string, unknown>;
        }
      } catch {
        // Non-critical, continue without account info
      }
    }

    await db
      .update(connectorInstances)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresIn ? now + tokens.expiresIn * 1000 : null,
        status: 'connected' as ConnectorStatus,
        accountEmail,
        accountInfo,
        updatedAt: now,
      })
      .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));

    log.info(
      { event: 'connector.authorized', instanceId, accountEmail },
      `Connector authorized: ${instance.label}`,
    );

    if (instance.connectorId === 'google') {
      void import('@/connectors/google-toolsets.js')
        .then((mod) => mod.registerGoogleToolsets())
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          log.warn(
            { event: 'connector.google_toolsets.refresh_failed', instanceId, error: message },
            'failed to refresh Google toolsets after authorization',
          );
        });
    }
  };

  return ok({ authUrl, waitForTokens: tokenHandler });
}

export async function listConnectorOAuthProfiles(
  connectorId: string,
): Promise<ServiceResult<ConnectorOAuthProfile[]>> {
  const definition = getConnectorDefinition(connectorId);
  if (!definition) return err('Unknown connector type', 400);
  if (definition.authType !== 'oauth2') return err('Connector does not use OAuth2', 400);

  const db = getDb();
  const rows = await db
    .select()
    .from(connectorOAuthProfiles)
    .where(eq(connectorOAuthProfiles.connectorId, connectorId))
    .orderBy(asc(connectorOAuthProfiles.createdAt));

  return ok(rows.map((row) => toSafeOAuthProfile(row as ConnectorOAuthProfileRow)));
}

export async function createConnectorOAuthProfile(input: {
  connectorId: string;
  label: string;
  clientId: string;
  clientSecret: string;
}): Promise<ServiceResult<ConnectorOAuthProfile>> {
  const definition = getConnectorDefinition(input.connectorId);
  if (!definition) return err('Unknown connector type', 400);
  if (definition.authType !== 'oauth2') return err('Connector does not use OAuth2', 400);

  const db = getDb();
  const id = createConnectorOAuthProfileId();
  const now = Date.now();

  try {
    await db.insert(connectorOAuthProfiles).values({
      id,
      connectorId: input.connectorId,
      label: input.label,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    return err('OAuth profile label already exists for this connector', 400);
  }

  const [row] = await db
    .select()
    .from(connectorOAuthProfiles)
    .where(eq(connectorOAuthProfiles.id, id));

  return ok(toSafeOAuthProfile(row as ConnectorOAuthProfileRow));
}

export async function deleteConnectorOAuthProfile(profileId: string): Promise<ServiceResult<null>> {
  const db = getDb();
  const typedProfileId = profileId as PrefixedString<'connp'>;

  const [profile] = await db
    .select()
    .from(connectorOAuthProfiles)
    .where(eq(connectorOAuthProfiles.id, typedProfileId));

  if (!profile) return err('OAuth profile not found', 404);

  const inUse = await db
    .select({ id: connectorInstances.id })
    .from(connectorInstances)
    .where(eq(connectorInstances.oauthProfileId, typedProfileId));

  if (inUse.length > 0) {
    return err('OAuth profile is in use by one or more connectors', 400);
  }

  await db.delete(connectorOAuthProfiles).where(eq(connectorOAuthProfiles.id, typedProfileId));
  return ok(null);
}

export async function updateConnectorInstance(
  instanceId: string,
  updates: { label?: string; scopes?: string[] },
): Promise<ServiceResult<ConnectorInstanceSafe>> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(connectorInstances)
    .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));

  if (!existing) return err('Connector instance not found', 404);

  const setValues: Record<string, unknown> = { updatedAt: Date.now() };
  if (updates.label !== undefined) setValues['label'] = updates.label;
  if (updates.scopes !== undefined) setValues['scopes'] = updates.scopes;

  await db
    .update(connectorInstances)
    .set(setValues)
    .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));

  const [row] = await db
    .select()
    .from(connectorInstances)
    .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));

  return ok(toSafe(row as ConnectorInstance));
}

export async function deleteConnectorInstance(instanceId: string): Promise<ServiceResult<null>> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(connectorInstances)
    .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));

  if (!existing) return err('Connector instance not found', 404);

  await db
    .delete(connectorInstances)
    .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));

  if (existing.connectorId === 'google') {
    void import('@/connectors/google-toolsets.js')
      .then((mod) => mod.registerGoogleToolsets())
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(
          { event: 'connector.google_toolsets.refresh_failed', instanceId, error: message },
          'failed to refresh Google toolsets after deletion',
        );
      });
  }

  log.info(
    { event: 'connector.deleted', instanceId },
    `Connector instance deleted: ${existing.label}`,
  );

  return ok(null);
}

export async function testConnectorInstance(instanceId: string): Promise<ServiceResult<boolean>> {
  const db = getDb();
  const [instance] = await db
    .select()
    .from(connectorInstances)
    .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));

  if (!instance) return err('Connector instance not found', 404);

  const definition = getConnectorDefinition(instance.connectorId);
  if (!definition) return err('Unknown connector type', 400);

  try {
    if (definition.authType === 'oauth2' && instance.accessToken) {
      if (instance.connectorId === 'google') {
        // Try userinfo first (requires openid scope), fall back to tokeninfo
        const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${instance.accessToken}` },
        });
        if (!res.ok) {
          // Fallback: validate the token itself via tokeninfo endpoint
          const tokenRes = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?access_token=${instance.accessToken}`,
          );
          if (!tokenRes.ok) throw new Error(`Google API returned ${tokenRes.status}`);
        }
      }
    } else if (definition.authType === 'api_key' && instance.apiKey) {
      if (instance.connectorId === 'slack') {
        const res = await fetch('https://slack.com/api/auth.test', {
          headers: { Authorization: `Bearer ${instance.apiKey}` },
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!data.ok) throw new Error(`Slack API error: ${data.error}`);

        // Update account info from Slack
        const infoRes = await fetch('https://slack.com/api/team.info', {
          headers: { Authorization: `Bearer ${instance.apiKey}` },
        });
        const infoData = (await infoRes.json()) as {
          ok: boolean;
          team?: { name: string; domain: string };
        };
        if (infoData.ok && infoData.team) {
          await db
            .update(connectorInstances)
            .set({
              accountInfo: infoData.team as unknown as Record<string, unknown>,
              accountEmail: infoData.team.domain,
              updatedAt: Date.now(),
            })
            .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));
        }
      }
    } else {
      return err('Connector has no credentials to test', 400);
    }

    return ok(true);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error({ event: 'connector.test.failed', instanceId, error: message }, 'Connection test failed');

    await db
      .update(connectorInstances)
      .set({ status: 'error' as ConnectorStatus, updatedAt: Date.now() })
      .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));

    return err(`Connection test failed: ${message}`, 400);
  }
}
