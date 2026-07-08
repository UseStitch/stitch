import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { ConnectorDefinition } from '@stitch/shared/connectors/types';

import { registerConnector, unregisterConnector } from '@/connectors/registry.js';
import {
  authorizeOAuthInstance,
  createOAuthConnector,
  createApiKeyConnectorInstance,
  upgradeConnectorInstance,
} from '@/connectors/service.js';
import { getDb } from '@/db/client.js';
import { connectorInstances, connectors } from '@/db/schema/connectors.js';
import { setupTestDb } from '@/db/test-helpers.js';

setupTestDb();

function oauthDefinition(overrides: Partial<ConnectorDefinition> = {}): ConnectorDefinition {
  return {
    id: 'example',
    name: 'Example OAuth',
    description: 'Example',
    icon: { type: 'simpleIcons', slug: 'example' },
    enabled: true,
    currentVersion: 3,
    versionHistory: [
      { version: 1, title: 'Base', description: 'Base', action: 'none', capabilities: ['example.read'] },
      {
        version: 2,
        title: 'Rotate key',
        description: 'Rotate key',
        action: 'rotate_api_key',
        capabilities: ['example.write'],
      },
      {
        version: 3,
        title: 'Scope upgrade',
        description: 'Needs reauth',
        action: 'reauthorize',
        capabilities: ['example.admin'],
        requiredScopes: ['scope:admin'],
      },
    ],
    authType: 'oauth2',
    authConfig: {
      authUrl: 'https://example.com/auth',
      tokenUrl: 'https://example.com/token',
      defaultScopes: ['scope:read'],
      scopeDescriptions: { 'scope:read': 'Read' },
    },
    setupInstructions: [],
    ...overrides,
  };
}

async function insertOAuthConnector(connectorRefId: string, connectorId = 'example'): Promise<void> {
  await getDb()
    .insert(connectors)
    .values({
      id: connectorRefId as never,
      connectorId,
      authType: 'oauth2',
      label: 'Example OAuth App',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      apiKey: 'old-key',
    });
}

describe('connector service', () => {
  beforeEach(() => {
    unregisterConnector('example');
    unregisterConnector('disabled-oauth');
    unregisterConnector('disabled-api-key');
  });

  test('upgrade requires api key when rotate action is present', async () => {
    const definition = oauthDefinition();
    registerConnector(definition);

    // Create an instance at v1 so upgrade sees rotate + reauthorize actions
    const db = getDb();
    const instanceId = 'conn_test_upgrade' as never;
    const connectorRefId = 'cnr_test_upgrade';
    await insertOAuthConnector(connectorRefId, definition.id);
    await db
      .insert(connectorInstances)
      .values({
        id: instanceId,
        connectorId: definition.id,
        connectorRefId: connectorRefId as never,
        label: 'Example',
        appliedVersion: 1,
        capabilities: ['example.read'],
        accessToken: 'token',
        refreshToken: 'refresh',
        tokenExpiresAt: Date.now() + 60_000,
        scopes: ['scope:read'],
        status: 'connected',
        authIssue: null,
        accountEmail: null,
        accountInfo: null,
      });

    const result = await upgradeConnectorInstance(instanceId, {});

    expect(result.error).not.toBeNull();
    if (result.error) {
      expect(result.error.status).toBe(400);
      expect(result.error.message).toContain('API key is required');
    }

    // Row should be unchanged
    const [row] = await db.select().from(connectorInstances).where(eq(connectorInstances.id, instanceId));
    expect(row?.appliedVersion).toBe(1);
  });

  test('upgrade handles mixed rotate + reauthorize actions', async () => {
    const definition = oauthDefinition();
    registerConnector(definition);

    const db = getDb();
    const instanceId = 'conn_test_mixed' as never;
    const connectorRefId = 'cnr_test_mixed';
    await insertOAuthConnector(connectorRefId, definition.id);
    await db
      .insert(connectorInstances)
      .values({
        id: instanceId,
        connectorId: definition.id,
        connectorRefId: connectorRefId as never,
        label: 'Example',
        appliedVersion: 1,
        capabilities: ['example.read'],
        accessToken: 'token',
        refreshToken: 'refresh',
        tokenExpiresAt: Date.now() + 60_000,
        scopes: ['scope:read'],
        status: 'connected',
        authIssue: null,
        accountEmail: null,
        accountInfo: null,
      });

    let requestedScopes: string[] = [];
    const fakeStartOAuthFlow = async (_config: unknown, _id: string, _secret: string, scopes: string[]) => {
      requestedScopes = scopes;
      return {
        authUrl: 'https://example.com/authorize',
        waitForTokens: async () => ({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
        }),
      };
    };

    const result = await upgradeConnectorInstance(
      instanceId,
      { apiKey: '  new-key  ' },
      { startOAuthFlow: fakeStartOAuthFlow },
    );

    expect(result.error).toBeNull();
    if (!result.error) {
      expect(result.data).toEqual({ type: 'reauthorize', authUrl: 'https://example.com/authorize' });
    }

    // Wait for the background waitForTokens to complete
    await new Promise((r) => setTimeout(r, 50));

    const [row] = await db.select().from(connectorInstances).where(eq(connectorInstances.id, instanceId));
    const [connector] = await db
      .select()
      .from(connectors)
      .where(eq(connectors.id, connectorRefId as never));
    // After token exchange the instance should be connected with the new key and merged scopes
    expect(connector?.apiKey).toBe('new-key');
    expect((row?.scopes as string[])?.includes('scope:admin')).toBe(true);
    expect(requestedScopes).toEqual(['scope:read', 'scope:admin']);
  });

  test('upgrade uses only missing scopes for incremental oauth connectors', async () => {
    const definition = oauthDefinition({
      authConfig: {
        authUrl: 'https://example.com/auth',
        tokenUrl: 'https://example.com/token',
        defaultScopes: ['scope:read'],
        scopeDescriptions: { 'scope:read': 'Read', 'scope:admin': 'Admin' },
        incrementalAuth: { enabled: true, params: { include_granted_scopes: 'true' } },
      },
    });
    registerConnector(definition);

    const db = getDb();
    const instanceId = 'conn_test_incremental' as never;
    const connectorRefId = 'cnr_test_incremental';
    await insertOAuthConnector(connectorRefId, definition.id);
    await db
      .insert(connectorInstances)
      .values({
        id: instanceId,
        connectorId: definition.id,
        connectorRefId: connectorRefId as never,
        label: 'Example',
        appliedVersion: 2,
        capabilities: ['example.read', 'example.write'],
        accessToken: 'token',
        refreshToken: 'refresh',
        tokenExpiresAt: Date.now() + 60_000,
        scopes: ['scope:read'],
        status: 'connected',
        authIssue: null,
        accountEmail: null,
        accountInfo: null,
      });

    let requestedScopes: string[] = [];
    let requestedParams: Record<string, string> | undefined;
    const fakeStartOAuthFlow = async (
      _config: unknown,
      _id: string,
      _secret: string,
      scopes: string[],
      options?: { additionalParams?: Record<string, string> },
    ) => {
      requestedScopes = scopes;
      requestedParams = options?.additionalParams;
      return {
        authUrl: 'https://example.com/authorize',
        waitForTokens: async () => ({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
        }),
      };
    };

    const result = await upgradeConnectorInstance(instanceId, {}, { startOAuthFlow: fakeStartOAuthFlow });

    expect(result.error).toBeNull();
    expect(requestedScopes).toEqual(['scope:admin']);
    expect(requestedParams).toEqual({ include_granted_scopes: 'true' });

    await new Promise((r) => setTimeout(r, 50));

    const [row] = await db.select().from(connectorInstances).where(eq(connectorInstances.id, instanceId));
    expect(row?.scopes).toEqual(['scope:read', 'scope:admin']);
  });

  test('disabled connectors cannot be created', async () => {
    registerConnector(oauthDefinition({ id: 'disabled-oauth', enabled: false }));
    registerConnector({
      id: 'disabled-api-key',
      name: 'Disabled API key',
      description: 'Disabled',
      icon: { type: 'simpleIcons', slug: 'api' },
      enabled: false,
      currentVersion: 1,
      versionHistory: [
        { version: 1, title: 'Initial', description: 'Initial', action: 'none', capabilities: ['example.api.read'] },
      ],
      authType: 'api_key',
      authConfig: { keyLabel: 'API Key' },
      setupInstructions: [],
    });

    const oauthConnectorResult = await createOAuthConnector({
      connectorId: 'disabled-oauth',
      label: 'Disabled OAuth',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });

    const apiKeyResult = await createApiKeyConnectorInstance({
      connectorId: 'disabled-api-key',
      label: 'Disabled API key',
      apiKey: 'secret',
    });

    expect(oauthConnectorResult.error).not.toBeNull();
    expect(apiKeyResult.error).not.toBeNull();
    if (oauthConnectorResult.error) expect(oauthConnectorResult.error.message).toBe('Connector is currently disabled');
    if (apiKeyResult.error) expect(apiKeyResult.error.message).toBe('Connector is currently disabled');

    // Nothing written to DB
    const rows = await getDb().select().from(connectorInstances);
    expect(rows).toHaveLength(0);
  });

  test('authorizeOAuthInstance marks connector as error when token exchange fails', async () => {
    const definition = oauthDefinition({
      currentVersion: 1,
      versionHistory: oauthDefinition().versionHistory.slice(0, 1),
    });
    registerConnector(definition);

    const db = getDb();
    const instanceId = 'conn_auth_fail' as never;
    const connectorRefId = 'cnr_auth_fail';
    await insertOAuthConnector(connectorRefId, definition.id);
    await db
      .insert(connectorInstances)
      .values({
        id: instanceId,
        connectorId: definition.id,
        connectorRefId: connectorRefId as never,
        label: 'Example OAuth',
        appliedVersion: 1,
        capabilities: ['example.read'],
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        scopes: ['scope:read'],
        status: 'awaiting_auth',
        authIssue: null,
        accountEmail: null,
        accountInfo: null,
      });

    const fakeStartOAuthFlow = async () => ({
      authUrl: 'https://example.com/authorize',
      waitForTokens: async () => {
        throw new Error('token exchange failed');
      },
    });

    const result = await authorizeOAuthInstance(instanceId, { startOAuthFlow: fakeStartOAuthFlow });

    expect(result.error).toBeNull();
    if (result.error) return;

    let threw = false;
    try {
      await result.data.waitForTokens();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    const [row] = await db.select().from(connectorInstances).where(eq(connectorInstances.id, instanceId));
    expect(row?.status).toBe('error');
  });

  test('authorizeOAuthInstance stores tokens and marks connector connected on success', async () => {
    const definition = oauthDefinition();
    registerConnector(definition);

    const db = getDb();
    const instanceId = 'conn_auth_success' as never;
    const connectorRefId = 'cnr_auth_success';
    await insertOAuthConnector(connectorRefId, definition.id);
    await db
      .insert(connectorInstances)
      .values({
        id: instanceId,
        connectorId: definition.id,
        connectorRefId: connectorRefId as never,
        label: 'Example OAuth',
        appliedVersion: 1,
        capabilities: ['example.read'],
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        scopes: ['scope:read'],
        status: 'awaiting_auth',
        authIssue: null,
        accountEmail: null,
        accountInfo: null,
      });

    const fakeStartOAuthFlow = async () => ({
      authUrl: 'https://example.com/authorize',
      waitForTokens: async () => ({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        expiresIn: 3600,
      }),
    });

    const result = await authorizeOAuthInstance(instanceId, { startOAuthFlow: fakeStartOAuthFlow });

    expect(result.error).toBeNull();
    if (result.error) return;

    await result.data.waitForTokens();

    const [row] = await db.select().from(connectorInstances).where(eq(connectorInstances.id, instanceId));
    expect(row?.status).toBe('connected');
    expect(row?.accessToken).toBe('access-token-123');
    expect(row?.refreshToken).toBe('refresh-token-123');
    expect(row?.appliedVersion).toBe(definition.currentVersion);
    expect(row?.capabilities).toEqual(['example.read', 'example.write', 'example.admin']);
    expect(typeof row?.tokenExpiresAt).toBe('number');
  });

  test('authorizeOAuthInstance uses default scopes for connected incremental oauth reauth', async () => {
    const definition = oauthDefinition({
      authConfig: {
        authUrl: 'https://example.com/auth',
        tokenUrl: 'https://example.com/token',
        defaultScopes: ['scope:read'],
        scopeDescriptions: { 'scope:read': 'Read', 'scope:docs': 'Docs' },
        incrementalAuth: { enabled: true, params: { include_granted_scopes: 'true' } },
      },
    });
    registerConnector(definition);

    const db = getDb();
    const instanceId = 'conn_auth_incremental_reauth' as never;
    const connectorRefId = 'cnr_auth_incremental_reauth';
    await insertOAuthConnector(connectorRefId, definition.id);
    await db
      .insert(connectorInstances)
      .values({
        id: instanceId,
        connectorId: definition.id,
        connectorRefId: connectorRefId as never,
        label: 'Example OAuth',
        appliedVersion: definition.currentVersion,
        capabilities: ['example.read', 'example.write', 'example.admin'],
        accessToken: 'old-access-token',
        refreshToken: 'existing-refresh-token',
        tokenExpiresAt: Date.now() - 1_000,
        scopes: ['scope:read', 'scope:docs'],
        status: 'connected',
        authIssue: null,
        accountEmail: null,
        accountInfo: null,
      });

    let requestedScopes: string[] = [];
    let requestedParams: Record<string, string> | undefined;
    const fakeStartOAuthFlow = async (
      _config: unknown,
      _id: string,
      _secret: string,
      scopes: string[],
      options?: { additionalParams?: Record<string, string> },
    ) => {
      requestedScopes = scopes;
      requestedParams = options?.additionalParams;
      return {
        authUrl: 'https://example.com/authorize',
        waitForTokens: async () => ({ accessToken: 'new-access-token', refreshToken: null, expiresIn: 3600 }),
      };
    };

    const result = await authorizeOAuthInstance(instanceId, { startOAuthFlow: fakeStartOAuthFlow });

    expect(result.error).toBeNull();
    expect(requestedScopes).toEqual(['scope:read']);
    expect(requestedParams).toEqual({ include_granted_scopes: 'true' });
  });

  test('authorizeOAuthInstance preserves existing refresh token when provider omits one', async () => {
    const definition = oauthDefinition();
    registerConnector(definition);

    const db = getDb();
    const instanceId = 'conn_auth_preserve_refresh' as never;
    const connectorRefId = 'cnr_auth_preserve_refresh';
    await insertOAuthConnector(connectorRefId, definition.id);
    await db
      .insert(connectorInstances)
      .values({
        id: instanceId,
        connectorId: definition.id,
        connectorRefId: connectorRefId as never,
        label: 'Example OAuth',
        appliedVersion: 1,
        capabilities: ['example.read'],
        accessToken: 'old-access-token',
        refreshToken: 'existing-refresh-token',
        tokenExpiresAt: Date.now() - 1_000,
        scopes: ['scope:read'],
        status: 'connected',
        authIssue: null,
        accountEmail: null,
        accountInfo: null,
      });

    const fakeStartOAuthFlow = async () => ({
      authUrl: 'https://example.com/authorize',
      waitForTokens: async () => ({ accessToken: 'new-access-token', refreshToken: null, expiresIn: 3600 }),
    });

    const result = await authorizeOAuthInstance(instanceId, { startOAuthFlow: fakeStartOAuthFlow });

    expect(result.error).toBeNull();
    if (result.error) return;

    await result.data.waitForTokens();

    const [row] = await db.select().from(connectorInstances).where(eq(connectorInstances.id, instanceId));
    expect(row?.status).toBe('connected');
    expect(row?.accessToken).toBe('new-access-token');
    expect(row?.refreshToken).toBe('existing-refresh-token');
  });
});
