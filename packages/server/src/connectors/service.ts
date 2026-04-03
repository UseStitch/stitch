import { asc, eq } from 'drizzle-orm';

import type {
  ConnectorDefinition,
  ConnectorInstance,
  ConnectorInstanceSafe,
  ConnectorStatus,
  OAuthConfig,
} from '@stitch/shared/connectors/types';
import { buildUpgradeState, getCapabilitiesForVersion } from '@stitch-connectors/sdk/upgrade';
import { createConnectorInstanceId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { resolveOAuthCredentials } from '@/connectors/auth/oauth-credentials.js';
import { startOAuthFlow } from '@/connectors/auth/oauth2.js';
import { getConnectorDefinition } from '@/connectors/registry.js';
import { getConnectorModule, refreshConnectorToolsetsFor } from '@/connectors/runtime.js';
import { getDb } from '@/db/client.js';
import { connectorInstances } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { err, ok, isServiceError } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

const log = Log.create({ service: 'connectors' });

function toSafe(
  instance: ConnectorInstance,
  definition: ConnectorDefinition | undefined,
): ConnectorInstanceSafe {
  const { clientSecret, accessToken, refreshToken, apiKey, ...rest } = instance;
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
      : buildUpgradeState({
          definition,
          appliedVersion,
          scopes: instance.scopes,
          capabilities: effectiveCapabilities,
        });

  return {
    ...rest,
    appliedVersion,
    capabilities: effectiveCapabilities,
    hasClientSecret: clientSecret !== null && clientSecret !== '',
    hasAccessToken: accessToken !== null && accessToken !== '',
    hasRefreshToken: refreshToken !== null && refreshToken !== '',
    hasApiKey: apiKey !== null && apiKey !== '',
    upgrade,
  };
}

export async function listConnectorInstances(): Promise<ConnectorInstanceSafe[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(connectorInstances)
    .orderBy(asc(connectorInstances.createdAt));
  return rows.map((r) => {
    const instance = r as ConnectorInstance;
    return toSafe(instance, getConnectorDefinition(instance.connectorId));
  });
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
  const instance = row as ConnectorInstance;
  return ok(toSafe(instance, getConnectorDefinition(instance.connectorId)));
}

export async function createOAuthConnectorInstance(input: {
  connectorId: string;
  label: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
}): Promise<ServiceResult<ConnectorInstanceSafe>> {
  const definition = getConnectorDefinition(input.connectorId);
  if (!definition) return err('Unknown connector type', 400);
  if (!definition.enabled) return err('Connector is currently disabled', 400);
  if (definition.authType !== 'oauth2') return err('Connector does not use OAuth2', 400);

  const db = getDb();
  const id = createConnectorInstanceId();

  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!clientId || !clientSecret) {
    return err('Client credentials are required', 400);
  }

  const instance = {
    id,
    connectorId: input.connectorId,
    label: input.label,
    appliedVersion: definition.currentVersion,
    capabilities: getCapabilitiesForVersion(definition, definition.currentVersion),
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

  const [row] = await db.select().from(connectorInstances).where(eq(connectorInstances.id, id));
  return ok(toSafe(row as ConnectorInstance, definition));
}

export async function createApiKeyConnectorInstance(input: {
  connectorId: string;
  label: string;
  apiKey: string;
}): Promise<ServiceResult<ConnectorInstanceSafe>> {
  const definition = getConnectorDefinition(input.connectorId);
  if (!definition) return err('Unknown connector type', 400);
  if (!definition.enabled) return err('Connector is currently disabled', 400);
  if (definition.authType !== 'api_key') return err('Connector does not use API key', 400);

  const db = getDb();
  const id = createConnectorInstanceId();

  const instance = {
    id,
    connectorId: input.connectorId,
    label: input.label,
    appliedVersion: definition.currentVersion,
    capabilities: getCapabilitiesForVersion(definition, definition.currentVersion),
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

  const [row] = await db.select().from(connectorInstances).where(eq(connectorInstances.id, id));
  return ok(toSafe(row as ConnectorInstance, definition));
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

  const resolvedOAuthCredentials = await resolveOAuthCredentials(instance);
  if (!resolvedOAuthCredentials) {
    return err('OAuth credentials not configured', 400);
  }

  const config = definition.authConfig as OAuthConfig;
  const scopes = (instance.scopes as string[]) ?? config.defaultScopes;

  const { authUrl, waitForTokens } = await startOAuthFlow(
    config,
    resolvedOAuthCredentials.clientId,
    resolvedOAuthCredentials.clientSecret,
    scopes,
  );

  const tokenHandler = async (): Promise<void> => {
    try {
      const tokens = await waitForTokens();
      const now = Date.now();

      let accountEmail: string | null = null;
      let accountInfo: Record<string, unknown> | null = null;
      const module = getConnectorModule(instance.connectorId);
      if (module?.hooks?.onAuthorized) {
        const hookResult = await module.hooks.onAuthorized({
          instance,
          accessToken: tokens.accessToken,
        });
        accountEmail = hookResult.accountEmail;
        accountInfo = hookResult.accountInfo;
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
          appliedVersion: definition.currentVersion,
          capabilities: getCapabilitiesForVersion(definition, definition.currentVersion),
          updatedAt: now,
        })
        .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));

      log.info(
        { event: 'connector.authorized', instanceId, accountEmail },
        `Connector authorized: ${instance.label}`,
      );

      await refreshConnectorToolsetsFor(instance.connectorId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(connectorInstances)
        .set({ status: 'error' as ConnectorStatus, updatedAt: Date.now() })
        .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));
      log.warn(
        { event: 'connector.authorize.failed', instanceId, error: message },
        'connector authorization failed',
      );
      throw error;
    }
  };

  return ok({ authUrl, waitForTokens: tokenHandler });
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

  const instance = row as ConnectorInstance;
  return ok(toSafe(instance, getConnectorDefinition(instance.connectorId)));
}

export async function upgradeConnectorInstance(
  instanceId: string,
  input: { apiKey?: string },
): Promise<ServiceResult<{ type: 'reauthorize'; authUrl: string } | { type: 'updated' }>> {
  const db = getDb();
  const typedInstanceId = instanceId as PrefixedString<'conn'>;
  const [instance] = await db
    .select()
    .from(connectorInstances)
    .where(eq(connectorInstances.id, typedInstanceId));

  if (!instance) return err('Connector instance not found', 404);

  const definition = getConnectorDefinition(instance.connectorId);
  if (!definition) return err('Unknown connector type', 400);

  const appliedVersion = Number.isFinite(instance.appliedVersion) ? instance.appliedVersion : 1;
  const capabilities = Array.isArray(instance.capabilities) ? instance.capabilities : [];

  const upgrade = buildUpgradeState({
    definition,
    appliedVersion,
    scopes: instance.scopes ?? null,
    capabilities,
  });

  if (!upgrade) {
    return err('Connector is already up to date', 400);
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
    return ok({ type: 'updated' });
  }

  const requiresApiKeyRotation = actions.includes('rotate_api_key');
  const requiresReauthorize = actions.includes('reauthorize');

  if (requiresApiKeyRotation && !input.apiKey?.trim()) {
    return err('A new API key is required to upgrade this connector', 400);
  }

  if (requiresApiKeyRotation && !requiresReauthorize) {
    await db
      .update(connectorInstances)
      .set({
        apiKey: input.apiKey?.trim() ?? null,
        appliedVersion: definition.currentVersion,
        capabilities: getCapabilitiesForVersion(definition, definition.currentVersion),
        status: 'connected' as ConnectorStatus,
        updatedAt: now,
      })
      .where(eq(connectorInstances.id, typedInstanceId));

    return ok({ type: 'updated' });
  }

  if (requiresReauthorize) {
    if (definition.authType !== 'oauth2') {
      return err('Connector upgrade requires reauthorization, but connector is not OAuth2', 400);
    }

    const currentScopes = instance.scopes ?? [];
    const scopeSet = new Set([...currentScopes, ...upgrade.missingScopes]);
    const nextScopes = [...scopeSet];

    const setValues: {
      scopes: string[];
      status: ConnectorStatus;
      updatedAt: number;
      apiKey?: string | null;
    } = {
      scopes: nextScopes,
      status: 'awaiting_auth' as ConnectorStatus,
      updatedAt: now,
    };

    if (requiresApiKeyRotation) {
      setValues.apiKey = input.apiKey?.trim() ?? null;
    }

    await db
      .update(connectorInstances)
      .set(setValues)
      .where(eq(connectorInstances.id, typedInstanceId));

    const auth = await authorizeOAuthInstance(instanceId);
    if (isServiceError(auth)) {
      return auth;
    }

    const { waitForTokens } = auth.data;
    void waitForTokens().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(
        { event: 'connector.upgrade.reauthorize.failed', instanceId, error: message },
        'connector upgrade reauthorization failed',
      );
    });
    return ok({ type: 'reauthorize', authUrl: auth.data.authUrl });
  }

  return err('Unsupported upgrade action for connector', 400);
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

  const module = getConnectorModule(existing.connectorId);
  if (module?.hooks?.onDeleted) {
    await module.hooks.onDeleted({ instance: existing });
  }
  await refreshConnectorToolsetsFor(existing.connectorId);

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
    const module = getConnectorModule(instance.connectorId);
    if (module?.hooks?.testConnection) {
      await module.hooks.testConnection({ instance });
      return ok(true);
    }

    if (definition.authType === 'oauth2' && instance.accessToken) {
      return ok(true);
    } else if (definition.authType === 'api_key' && instance.apiKey) {
      return err('Connector test is not supported for this connector type', 400);
    } else {
      return err('Connector has no credentials to test', 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(
      { event: 'connector.test.failed', instanceId, error: message },
      'Connection test failed',
    );

    await db
      .update(connectorInstances)
      .set({ status: 'error' as ConnectorStatus, updatedAt: Date.now() })
      .where(eq(connectorInstances.id, instanceId as PrefixedString<'conn'>));

    return err(`Connection test failed: ${message}`, 400);
  }
}
