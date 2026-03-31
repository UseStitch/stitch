import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { ConnectorDefinition, ConnectorInstance } from '@stitch/shared/connectors/types';
import type { PrefixedString } from '@stitch/shared/id';

import { connectorInstances } from '@/db/schema.js';
import {
  authorizeOAuthInstance,
  createApiKeyConnectorInstance,
  createOAuthConnectorInstance,
  upgradeConnectorInstance,
} from '@/connectors/service.js';
import { getDb } from '@/db/client.js';
import { getConnectorDefinition } from '@/connectors/registry.js';
import { startOAuthFlow } from '@/connectors/auth/oauth2.js';
import { isServiceError } from '@/lib/service-result.js';

vi.mock('@/db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/connectors/registry.js', () => ({
  getConnectorDefinition: vi.fn(),
}));

vi.mock('@/connectors/auth/oauth2.js', () => ({
  startOAuthFlow: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

type DbState = {
  instance: ConnectorInstance;
  updates: Array<Record<string, unknown>>;
};

type SelectQuery = {
  where: () => Promise<ConnectorInstance[]>;
  orderBy: () => Promise<ConnectorInstance[]>;
};

function createMockDb(state: DbState) {
  return {
    select: () => ({
      from: (table: unknown): SelectQuery => {
        if (table !== connectorInstances) {
          return {
            where: async () => [],
            orderBy: async () => [],
          };
        }

        return {
          where: async () => [state.instance],
          orderBy: async () => [state.instance],
        };
      },
    }),
    update: (table: unknown) => {
      if (table !== connectorInstances) {
        throw new Error('Unexpected table in update');
      }

      return {
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(values);
            state.instance = {
              ...state.instance,
              ...values,
            } as ConnectorInstance;
          },
        }),
      };
    },
  };
}

function oauthDefinition(overrides: Partial<ConnectorDefinition> = {}): ConnectorDefinition {
  return {
    id: 'example',
    name: 'Example OAuth',
    description: 'Example',
    icon: 'example',
    enabled: true,
    currentVersion: 3,
    versionHistory: [
      {
        version: 1,
        title: 'Base',
        description: 'Base',
        action: 'none',
        capabilities: ['example.read'],
      },
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

describe('connector service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('upgrade requires api key when rotate action is present', async () => {
    const definition = oauthDefinition();
    const instance: ConnectorInstance = {
      id: 'conn_test' as PrefixedString<'conn'>,
      connectorId: definition.id,
      label: 'Example',
      appliedVersion: 1,
      capabilities: ['example.read'],
      oauthProfileId: null,
      clientId: 'client-id',
      clientSecret: 'client-secret',
      apiKey: 'old-key',
      accessToken: 'token',
      refreshToken: 'refresh',
      tokenExpiresAt: Date.now() + 60_000,
      scopes: ['scope:read'],
      status: 'connected',
      accountEmail: null,
      accountInfo: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const state: DbState = { instance, updates: [] };
    vi.mocked(getDb).mockReturnValue(createMockDb(state) as never);
    vi.mocked(getConnectorDefinition).mockReturnValue(definition);

    const result = await upgradeConnectorInstance(instance.id, {});

    expect(isServiceError(result)).toBe(true);
    if (isServiceError(result)) {
      expect(result.status).toBe(400);
      expect(result.error).toContain('API key is required');
    }
    expect(state.updates).toHaveLength(0);
  });

  test('upgrade handles mixed rotate + reauthorize actions', async () => {
    const definition = oauthDefinition();
    const instance: ConnectorInstance = {
      id: 'conn_test' as PrefixedString<'conn'>,
      connectorId: definition.id,
      label: 'Example',
      appliedVersion: 1,
      capabilities: ['example.read'],
      oauthProfileId: null,
      clientId: 'client-id',
      clientSecret: 'client-secret',
      apiKey: 'old-key',
      accessToken: 'token',
      refreshToken: 'refresh',
      tokenExpiresAt: Date.now() + 60_000,
      scopes: ['scope:read'],
      status: 'connected',
      accountEmail: null,
      accountInfo: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const state: DbState = { instance, updates: [] };
    vi.mocked(getDb).mockReturnValue(createMockDb(state) as never);
    vi.mocked(getConnectorDefinition).mockImplementation((id: string) => {
      return id === definition.id ? definition : undefined;
    });
    vi.mocked(startOAuthFlow).mockResolvedValue({
      authUrl: 'https://example.com/authorize',
      waitForTokens: async () => ({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
      }),
    });

    const result = await upgradeConnectorInstance(instance.id, { apiKey: '  new-key  ' });

    expect(isServiceError(result)).toBe(false);
    if (!isServiceError(result)) {
      expect(result.data).toEqual({ type: 'reauthorize', authUrl: 'https://example.com/authorize' });
    }

    const upgradeUpdate = state.updates.find((update) => update['status'] === 'awaiting_auth');
    expect(upgradeUpdate).toBeDefined();
    expect(upgradeUpdate?.['apiKey']).toBe('new-key');
    expect(upgradeUpdate?.['scopes']).toEqual(['scope:read', 'scope:admin']);
  });

  test('disabled connectors cannot be created', async () => {
    const disabledOAuth = oauthDefinition({ enabled: false });
    vi.mocked(getConnectorDefinition).mockImplementation((id: string) => {
      if (id === 'disabled-oauth') {
        return { ...disabledOAuth, id: 'disabled-oauth' };
      }
      if (id === 'disabled-api-key') {
        return {
          id: 'disabled-api-key',
          name: 'Disabled API key',
          description: 'Disabled',
          icon: 'api',
          enabled: false,
          currentVersion: 1,
          versionHistory: [
            {
              version: 1,
              title: 'Initial',
              description: 'Initial',
              action: 'none',
              capabilities: ['example.api.read'],
            },
          ],
          authType: 'api_key',
          authConfig: {
            keyLabel: 'API Key',
          },
          setupInstructions: [],
        } satisfies ConnectorDefinition;
      }
      return undefined;
    });

    const oauthResult = await createOAuthConnectorInstance({
      connectorId: 'disabled-oauth',
      label: 'Disabled OAuth',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      scopes: ['scope:read'],
    });

    const apiKeyResult = await createApiKeyConnectorInstance({
      connectorId: 'disabled-api-key',
      label: 'Disabled API key',
      apiKey: 'secret',
    });

    expect(isServiceError(oauthResult)).toBe(true);
    expect(isServiceError(apiKeyResult)).toBe(true);
    if (isServiceError(oauthResult)) {
      expect(oauthResult.error).toBe('Connector is currently disabled');
    }
    if (isServiceError(apiKeyResult)) {
      expect(apiKeyResult.error).toBe('Connector is currently disabled');
    }
    expect(getDb).not.toHaveBeenCalled();
  });

  test('authorizeOAuthInstance marks connector as error when token exchange fails', async () => {
    const definition = oauthDefinition({ currentVersion: 1, versionHistory: oauthDefinition().versionHistory.slice(0, 1) });
    const instance: ConnectorInstance = {
      id: 'conn_auth_fail' as PrefixedString<'conn'>,
      connectorId: definition.id,
      label: 'Example OAuth',
      appliedVersion: 1,
      capabilities: ['example.read'],
      oauthProfileId: null,
      clientId: 'client-id',
      clientSecret: 'client-secret',
      apiKey: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      scopes: ['scope:read'],
      status: 'awaiting_auth',
      accountEmail: null,
      accountInfo: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const state: DbState = { instance, updates: [] };
    vi.mocked(getDb).mockReturnValue(createMockDb(state) as never);
    vi.mocked(getConnectorDefinition).mockReturnValue(definition);
    vi.mocked(startOAuthFlow).mockResolvedValue({
      authUrl: 'https://example.com/authorize',
      waitForTokens: async () => {
        throw new Error('token exchange failed');
      },
    });

    const result = await authorizeOAuthInstance(instance.id);

    expect(isServiceError(result)).toBe(false);
    if (isServiceError(result)) {
      return;
    }

    await expect(result.data.waitForTokens()).rejects.toThrow('token exchange failed');

    const errorUpdate = state.updates.find((update) => update['status'] === 'error');
    expect(errorUpdate).toBeDefined();
  });

  test('authorizeOAuthInstance stores tokens and marks connector connected on success', async () => {
    const definition = oauthDefinition();
    const instance: ConnectorInstance = {
      id: 'conn_auth_success' as PrefixedString<'conn'>,
      connectorId: definition.id,
      label: 'Example OAuth',
      appliedVersion: 1,
      capabilities: ['example.read'],
      oauthProfileId: null,
      clientId: 'client-id',
      clientSecret: 'client-secret',
      apiKey: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      scopes: ['scope:read'],
      status: 'awaiting_auth',
      accountEmail: null,
      accountInfo: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const state: DbState = { instance, updates: [] };
    vi.mocked(getDb).mockReturnValue(createMockDb(state) as never);
    vi.mocked(getConnectorDefinition).mockReturnValue(definition);
    vi.mocked(startOAuthFlow).mockResolvedValue({
      authUrl: 'https://example.com/authorize',
      waitForTokens: async () => ({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        expiresIn: 3600,
      }),
    });

    const result = await authorizeOAuthInstance(instance.id);

    expect(isServiceError(result)).toBe(false);
    if (isServiceError(result)) {
      return;
    }

    await expect(result.data.waitForTokens()).resolves.toBeUndefined();

    const connectedUpdate = state.updates.find((update) => update['status'] === 'connected');
    expect(connectedUpdate).toBeDefined();
    expect(connectedUpdate?.['accessToken']).toBe('access-token-123');
    expect(connectedUpdate?.['refreshToken']).toBe('refresh-token-123');
    expect(connectedUpdate?.['appliedVersion']).toBe(definition.currentVersion);
    expect(connectedUpdate?.['capabilities']).toEqual([
      'example.read',
      'example.write',
      'example.admin',
    ]);
    expect(typeof connectedUpdate?.['tokenExpiresAt']).toBe('number');
  });
});
