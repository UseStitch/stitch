import { asc, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { buildUpgradeState, getCapabilitiesForVersion } from '@stitch-connectors/sdk/upgrade';

import type {
  Connector,
  ConnectorDefinition,
  ConnectorInstance,
  ConnectorInstanceSafe,
  ConnectorSafe,
  ConnectorStatus,
  OAuthConfig,
} from '@stitch/shared/connectors/types';
import { createConnectorId, createConnectorInstanceId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { resolveOAuthCredentials } from '@/connectors/auth/oauth-credentials.js';
import {
  refreshAccessToken,
  requiresOAuthReauth,
  startOAuthFlow as startOAuthFlowDefault,
} from '@/connectors/auth/oauth2.js';
import type { startOAuthFlow as StartOAuthFlowFn } from '@/connectors/auth/oauth2.js';
import { withRefreshLock } from '@/connectors/auth/refresh-lock.js';
import { getConnectorDefinition } from '@/connectors/registry.js';
import { getConnectorModule } from '@/connectors/runtime.js';
import { getDb } from '@/db/client.js';
import { connectorInstances, connectors } from '@/db/schema/connectors.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'connectors' });
const REFRESH_BUFFER_MS = 60_000;

function toSafe(instance: ConnectorInstance, definition: ConnectorDefinition | undefined): ConnectorInstanceSafe {
  const { accessToken, refreshToken, ...rest } = instance;
  const appliedVersion = Number.isFinite(instance.appliedVersion) ? instance.appliedVersion : 1;
  const storedCapabilities = Array.isArray(instance.capabilities) ? instance.capabilities : [];
  const effectiveCapabilities =
    storedCapabilities.length > 0 && definition
      ? storedCapabilities
      : definition
        ? getCapabilitiesForVersion(definition, appliedVersion)
        : storedCapabilities;

  const upgrade =
    definition === undefined
      ? null
      : buildUpgradeState({ definition, appliedVersion, scopes: instance.scopes, capabilities: effectiveCapabilities });

  return {
    ...rest,
    appliedVersion,
    capabilities: effectiveCapabilities,
    hasAccessToken: accessToken !== null && accessToken !== '',
    hasRefreshToken: refreshToken !== null && refreshToken !== '',
    upgrade,
  };
}

function toConnector(row: typeof connectors.$inferSelect): Connector {
  if (row.authType === 'oauth2') {
    return {
      id: row.id,
      connectorId: row.connectorId,
      authType: row.authType,
      label: row.label,
      clientId: row.clientId ?? '',
      clientSecret: row.clientSecret ?? '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  return {
    id: row.id,
    connectorId: row.connectorId,
    authType: row.authType,
    label: row.label,
    apiKey: row.apiKey ?? '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toConnectorSafe(connector: Connector): ConnectorSafe {
  if (connector.authType === 'oauth2') {
    const { clientSecret, ...rest } = connector;
    return { ...rest, hasClientSecret: clientSecret !== '' };
  }

  const { apiKey, ...rest } = connector;
  return { ...rest, hasApiKey: apiKey !== '' };
}

export async function listConnectors(): Promise<ConnectorSafe[]> {
  const db = getDb();
  const rows = await db.select().from(connectors).orderBy(asc(connectors.createdAt));
  return rows.map((row) => toConnectorSafe(toConnector(row)));
}

export async function createOAuthConnector(input: {
  connectorId: string;
  label: string;
  clientId: string;
  clientSecret: string;
}): Promise<ConnectorSafe> {
  const definition = getConnectorDefinition(input.connectorId);
  if (!definition) throw new HTTPException(400, { message: 'Unknown connector type' });
  if (!definition.enabled) throw new HTTPException(400, { message: 'Connector is currently disabled' });
  if (definition.authType !== 'oauth2') throw new HTTPException(400, { message: 'Connector does not use OAuth2' });

  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!clientId || !clientSecret) {
    throw new HTTPException(400, { message: 'Client credentials are required' });
  }

  const db = getDb();
  const id = createConnectorId();
  const connector = {
    id,
    connectorId: input.connectorId,
    authType: 'oauth2' as const,
    label: input.label,
    clientId,
    clientSecret,
    apiKey: null,
  };

  await db.insert(connectors).values(connector);

  log.info(
    { event: 'connector.credentials.created', connectorRefId: id, connectorId: input.connectorId },
    'Connector created',
  );

  const [row] = await db.select().from(connectors).where(eq(connectors.id, id));
  return toConnectorSafe(toConnector(row));
}

export async function deleteConnector(connectorRefId: string): Promise<void> {
  const db = getDb();
  const typedConnectorRefId = connectorRefId as PrefixedString<'cnr'>;
  const existing = (await db.select().from(connectors).where(eq(connectors.id, typedConnectorRefId))).at(0);

  if (!existing) throw new HTTPException(404, { message: 'Connector not found' });

  await db.delete(connectors).where(eq(connectors.id, typedConnectorRefId));
  internalBus.emit('connector.removed', { instanceId: null, connectorId: existing.connectorId });

  log.info(
    { event: 'connector.credentials.deleted', connectorRefId, connectorId: existing.connectorId },
    `Connector deleted: ${existing.label}`,
  );
}

export async function listConnectorInstances(): Promise<ConnectorInstanceSafe[]> {
  const db = getDb();
  const rows = await db.select().from(connectorInstances).orderBy(asc(connectorInstances.createdAt));
  return rows.map((r) => {
    const instance = r as ConnectorInstance;
    return toSafe(instance, getConnectorDefinition(instance.connectorId));
  });
}

export async function getConnectorInstance(id: string): Promise<ConnectorInstanceSafe> {
  const db = getDb();
  const row = (
    await db
      .select()
      .from(connectorInstances)
      .where(eq(connectorInstances.id, id as PrefixedString<'conn'>))
  ).at(0);

  if (!row) throw new HTTPException(404, { message: 'Connector instance not found' });
  const instance = row as ConnectorInstance;
  return toSafe(instance, getConnectorDefinition(instance.connectorId));
}

export async function createOAuthConnectorInstance(input: {
  connectorRefId: string;
  label: string;
  scopes: string[];
}): Promise<ConnectorInstanceSafe> {
  const db = getDb();
  const connector = (
    await db
      .select()
      .from(connectors)
      .where(eq(connectors.id, input.connectorRefId as PrefixedString<'cnr'>))
  ).at(0);

  if (!connector) throw new HTTPException(404, { message: 'Connector not found' });

  const definition = getConnectorDefinition(connector.connectorId);
  if (!definition) throw new HTTPException(400, { message: 'Unknown connector type' });
  if (!definition.enabled) throw new HTTPException(400, { message: 'Connector is currently disabled' });
  if (definition.authType !== 'oauth2') throw new HTTPException(400, { message: 'Connector does not use OAuth2' });
  if (!connector.clientId || !connector.clientSecret)
    throw new HTTPException(400, { message: 'OAuth credentials not configured' });

  const id = createConnectorInstanceId();

  const instance = {
    id,
    connectorId: connector.connectorId,
    connectorRefId: connector.id,
    label: input.label,
    appliedVersion: definition.currentVersion,
    capabilities: getCapabilitiesForVersion(definition, definition.currentVersion),
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: null,
    scopes: input.scopes,
    status: 'awaiting_auth' as ConnectorStatus,
    authIssue: null,
    accountEmail: null,
    accountInfo: null,
  };

  await db.insert(connectorInstances).values(instance);

  log.info(
    {
      event: 'connector.account.created',
      instanceId: id,
      connectorRefId: connector.id,
      connectorId: connector.connectorId,
    },
    `Connector instance created: ${input.label}`,
  );

  const [row] = await db.select().from(connectorInstances).where(eq(connectorInstances.id, id));
  return toSafe(row as ConnectorInstance, definition);
}

export async function createApiKeyConnectorInstance(input: {
  connectorId: string;
  label: string;
  apiKey: string;
}): Promise<ConnectorInstanceSafe> {
  const definition = getConnectorDefinition(input.connectorId);
  if (!definition) throw new HTTPException(400, { message: 'Unknown connector type' });
  if (!definition.enabled) throw new HTTPException(400, { message: 'Connector is currently disabled' });
  if (definition.authType !== 'api_key') throw new HTTPException(400, { message: 'Connector does not use API key' });

  const db = getDb();
  const connectorRefId = createConnectorId();
  const id = createConnectorInstanceId();

  await db
    .insert(connectors)
    .values({
      id: connectorRefId,
      connectorId: input.connectorId,
      authType: 'api_key',
      label: input.label,
      clientId: null,
      clientSecret: null,
      apiKey: input.apiKey,
    });

  const instance = {
    id,
    connectorId: input.connectorId,
    connectorRefId,
    label: input.label,
    appliedVersion: definition.currentVersion,
    capabilities: getCapabilitiesForVersion(definition, definition.currentVersion),
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: null,
    scopes: null,
    status: 'connected' as ConnectorStatus,
    authIssue: null,
    accountEmail: null,
    accountInfo: null,
  };

  await db.insert(connectorInstances).values(instance);

  log.info(
    { event: 'connector.created', instanceId: id, connectorId: input.connectorId },
    `API key connector instance created: ${input.label}`,
  );

  const [row] = await db.select().from(connectorInstances).where(eq(connectorInstances.id, id));
  return toSafe(row as ConnectorInstance, definition);
}

export async function authorizeOAuthInstance(
  instanceId: string,
  deps?: { startOAuthFlow?: typeof StartOAuthFlowFn },
  options?: { scopes?: string[]; additionalParams?: Record<string, string> },
): Promise<{ authUrl: string; waitForTokens: () => Promise<void> }> {
  const db = getDb();
  const instance = (
    await db
      .select()
      .from(connectorInstances)
      .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>))
  ).at(0);

  if (!instance) throw new HTTPException(404, { message: 'Connector instance not found' });

  const definition = getConnectorDefinition(instance.connectorId);
  if (!definition || definition.authType !== 'oauth2') {
    throw new HTTPException(400, { message: 'Connector does not use OAuth2' });
  }

  const resolvedOAuthCredentials = await resolveOAuthCredentials(instance);
  if (!resolvedOAuthCredentials) {
    throw new HTTPException(400, { message: 'OAuth credentials not configured' });
  }

  const config = definition.authConfig as OAuthConfig;
  const useIncrementalRefresh =
    options?.scopes === undefined && config.incrementalAuth?.enabled === true && instance.status === 'connected';
  const scopes = options?.scopes ?? (useIncrementalRefresh ? config.defaultScopes : (instance.scopes as string[]));
  const additionalParams =
    options?.additionalParams ?? (useIncrementalRefresh ? config.incrementalAuth?.params : undefined);

  const { authUrl, waitForTokens } = await (deps?.startOAuthFlow ?? startOAuthFlowDefault)(
    config,
    resolvedOAuthCredentials.clientId,
    resolvedOAuthCredentials.clientSecret,
    scopes,
    { additionalParams },
  );

  const tokenHandler = async (): Promise<void> => {
    try {
      const tokens = await waitForTokens();
      const now = Date.now();

      let accountEmail: string | null = null;
      let accountInfo: Record<string, unknown> | null = null;
      const module = getConnectorModule(instance.connectorId);
      if (module?.hooks?.onAuthorized) {
        const hookResult = await module.hooks.onAuthorized({ instance, accessToken: tokens.accessToken, logger: log });
        accountEmail = hookResult.accountEmail;
        accountInfo = hookResult.accountInfo;
      }

      await db
        .update(connectorInstances)
        .set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? instance.refreshToken,
          tokenExpiresAt: tokens.expiresIn ? now + tokens.expiresIn * 1000 : null,
          status: 'connected' as ConnectorStatus,
          authIssue: null,
          accountEmail,
          accountInfo,
          appliedVersion: definition.currentVersion,
          capabilities: getCapabilitiesForVersion(definition, definition.currentVersion),
          updatedAt: now,
        })
        .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));

      log.info({ event: 'connector.authorized', instanceId, accountEmail }, `Connector authorized: ${instance.label}`);
      internalBus.emit('connector.authorized', { instanceId, connectorId: instance.connectorId });
    } catch (error) {
      const message = Error.isError(error) ? error.message : String(error);
      await db
        .update(connectorInstances)
        .set({ status: 'error' as ConnectorStatus, authIssue: 'temporary_failure', updatedAt: Date.now() })
        .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));
      log.warn({ event: 'connector.authorize.failed', instanceId, error: message }, 'connector authorization failed');
      internalBus.emit('connector.auth.failed', { instanceId });
      throw error;
    }
  };

  return { authUrl, waitForTokens: tokenHandler };
}

export async function updateConnectorInstance(
  instanceId: string,
  updates: { label?: string; scopes?: string[] },
): Promise<ConnectorInstanceSafe> {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(connectorInstances)
      .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>))
  ).at(0);

  if (!existing) throw new HTTPException(404, { message: 'Connector instance not found' });

  const setValues: Partial<typeof connectorInstances.$inferInsert> = { updatedAt: Date.now() };
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

  const instance = row as ConnectorInstance;
  return toSafe(instance, getConnectorDefinition(instance.connectorId));
}

export async function upgradeConnectorInstance(
  instanceId: string,
  input: { apiKey?: string },
  deps?: { startOAuthFlow?: typeof StartOAuthFlowFn },
): Promise<{ type: 'reauthorize'; authUrl: string } | { type: 'updated' }> {
  const db = getDb();
  const typedInstanceId = instanceId as PrefixedString<'conn'>;
  const instance = (await db.select().from(connectorInstances).where(eq(connectorInstances.id, typedInstanceId))).at(0);

  if (!instance) throw new HTTPException(404, { message: 'Connector instance not found' });

  const definition = getConnectorDefinition(instance.connectorId);
  if (!definition) throw new HTTPException(400, { message: 'Unknown connector type' });

  const appliedVersion = Number.isFinite(instance.appliedVersion) ? instance.appliedVersion : 1;
  const capabilities = Array.isArray(instance.capabilities) ? instance.capabilities : [];

  const upgrade = buildUpgradeState({ definition, appliedVersion, scopes: instance.scopes ?? null, capabilities });

  if (!upgrade) {
    throw new HTTPException(400, { message: 'Connector is already up to date' });
  }

  const now = Date.now();
  const actions = upgrade.actions.filter((action) => action !== 'none');
  if (actions.length === 0) {
    await db
      .update(connectorInstances)
      .set({
        appliedVersion: definition.currentVersion,
        capabilities: getCapabilitiesForVersion(definition, definition.currentVersion),
        updatedAt: now,
      })
      .where(eq(connectorInstances.id, typedInstanceId));
    internalBus.emit('connector.authorized', { instanceId, connectorId: instance.connectorId });
    return { type: 'updated' };
  }

  const requiresApiKeyRotation = actions.includes('rotate_api_key');
  const requiresReauthorize = actions.includes('reauthorize');

  if (requiresApiKeyRotation && !input.apiKey?.trim()) {
    throw new HTTPException(400, { message: 'A new API key is required to upgrade this connector' });
  }

  if (requiresApiKeyRotation && !requiresReauthorize) {
    await db
      .update(connectors)
      .set({ apiKey: input.apiKey?.trim() ?? null, updatedAt: now })
      .where(eq(connectors.id, instance.connectorRefId));

    await db
      .update(connectorInstances)
      .set({
        appliedVersion: definition.currentVersion,
        capabilities: getCapabilitiesForVersion(definition, definition.currentVersion),
        status: 'connected' as ConnectorStatus,
        authIssue: null,
        updatedAt: now,
      })
      .where(eq(connectorInstances.id, typedInstanceId));

    internalBus.emit('connector.authorized', { instanceId, connectorId: instance.connectorId });

    return { type: 'updated' };
  }

  if (requiresReauthorize) {
    if (definition.authType !== 'oauth2') {
      throw new HTTPException(400, {
        message: 'Connector upgrade requires reauthorization, but connector is not OAuth2',
      });
    }

    const currentScopes = instance.scopes ?? [];
    const scopeSet = new Set([...currentScopes, ...upgrade.missingScopes]);
    const nextScopes = [...scopeSet];

    const setValues: { scopes: string[]; status: ConnectorStatus; authIssue: null; updatedAt: number } = {
      scopes: nextScopes,
      status: 'awaiting_auth' as ConnectorStatus,
      authIssue: null,
      updatedAt: now,
    };

    if (requiresApiKeyRotation) {
      await db
        .update(connectors)
        .set({ apiKey: input.apiKey?.trim() ?? null, updatedAt: now })
        .where(eq(connectors.id, instance.connectorRefId));
    }

    await db.update(connectorInstances).set(setValues).where(eq(connectorInstances.id, typedInstanceId));

    const config = definition.authConfig as OAuthConfig;
    const authScopes = config.incrementalAuth?.enabled ? upgrade.missingScopes : nextScopes;
    const authResult = await authorizeOAuthInstance(instanceId, deps, {
      scopes: authScopes.length > 0 ? authScopes : nextScopes,
      additionalParams: config.incrementalAuth?.params,
    });

    const { waitForTokens } = authResult;
    void waitForTokens().catch((error) => {
      const message = Error.isError(error) ? error.message : String(error);
      log.warn(
        { event: 'connector.upgrade.reauthorize.failed', instanceId, error: message },
        'connector upgrade reauthorization failed',
      );
    });
    return { type: 'reauthorize', authUrl: authResult.authUrl };
  }

  throw new HTTPException(400, { message: 'Unsupported upgrade action for connector' });
}

export async function deleteConnectorInstance(instanceId: string): Promise<void> {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(connectorInstances)
      .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>))
  ).at(0);

  if (!existing) throw new HTTPException(404, { message: 'Connector instance not found' });

  await db.delete(connectorInstances).where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));

  const module = getConnectorModule(existing.connectorId);
  if (module?.hooks?.onDeleted) {
    await module.hooks.onDeleted({ instance: existing, logger: log });
  }
  internalBus.emit('connector.removed', { instanceId, connectorId: existing.connectorId });

  log.info({ event: 'connector.deleted', instanceId }, `Connector instance deleted: ${existing.label}`);
}

export async function testConnectorInstance(instanceId: string): Promise<boolean> {
  const db = getDb();
  const instance = (
    await db
      .select()
      .from(connectorInstances)
      .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>))
  ).at(0);

  if (!instance) throw new HTTPException(404, { message: 'Connector instance not found' });

  const definition = getConnectorDefinition(instance.connectorId);
  if (!definition) throw new HTTPException(400, { message: 'Unknown connector type' });

  try {
    // Proactively refresh an expiring/expired OAuth token before testing so the
    // hook receives a usable access token even if the stored one has lapsed.
    let testedInstance = instance;
    if (
      definition.authType === 'oauth2' &&
      instance.refreshToken &&
      (instance.accessToken === null ||
        (instance.tokenExpiresAt !== null && instance.tokenExpiresAt <= Date.now() + REFRESH_BUFFER_MS))
    ) {
      const creds = await resolveOAuthCredentials(instance);
      if (creds) {
        const config = definition.authConfig as OAuthConfig;
        const now = Date.now();
        const refreshToken = instance.refreshToken;
        const refreshed = await withRefreshLock(instance.id, () =>
          refreshAccessToken(config.tokenUrl, creds.clientId, creds.clientSecret, refreshToken),
        );
        await db
          .update(connectorInstances)
          .set({
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken ?? refreshToken,
            tokenExpiresAt: refreshed.expiresIn ? now + refreshed.expiresIn * 1000 : null,
            status: 'connected' as ConnectorStatus,
            authIssue: null,
            updatedAt: now,
          })
          .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));
        internalBus.emit('connector.token.refreshed', { instanceId });
        testedInstance = {
          ...instance,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? refreshToken,
          tokenExpiresAt: refreshed.expiresIn ? now + refreshed.expiresIn * 1000 : null,
        };
      }
    }

    const module = getConnectorModule(instance.connectorId);
    if (module?.hooks?.testConnection) {
      await module.hooks.testConnection({ instance: testedInstance, logger: log });
      return true;
    }

    if (definition.authType === 'oauth2' && testedInstance.accessToken) {
      return true;
    } else if (definition.authType === 'api_key') {
      const connector = (await db.select().from(connectors).where(eq(connectors.id, instance.connectorRefId))).at(0);
      if (!connector?.apiKey) throw new HTTPException(400, { message: 'Connector has no credentials to test' });
      throw new HTTPException(400, { message: 'Connector test is not supported for this connector type' });
    }
    throw new HTTPException(400, { message: 'Connector has no credentials to test' });
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    const message = Error.isError(e) ? e.message : String(e);
    const requiresReauth = requiresOAuthReauth(e);
    log.error({ event: 'connector.test.failed', instanceId, requiresReauth, error: message }, 'Connection test failed');

    if (requiresReauth) {
      await db
        .update(connectorInstances)
        .set({ status: 'error' as ConnectorStatus, authIssue: 'reauthorization_required', updatedAt: Date.now() })
        .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));
      internalBus.emit('connector.auth.failed', { instanceId });
    }

    throw new HTTPException(400, {
      message: requiresReauth
        ? 'Connection test failed: Google requires reauthorization for this account.'
        : `Connection test failed: Temporary Google auth failure. ${message}`,
    });
  }
}
