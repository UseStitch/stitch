import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { ConnectorDefinition, ConnectorInstance } from '@stitch/shared/connectors/types';
import type { PrefixedString } from '@stitch/shared/id';

import { resolveOAuthCredentials } from '@/connectors/auth/oauth-credentials.js';
import { OAuthRefreshError, refreshAccessToken } from '@/connectors/auth/oauth2.js';
import { refreshExpiringTokens } from '@/connectors/auth/token-refresh.js';
import { getConnectorDefinition } from '@/connectors/registry.js';
import { getDb } from '@/db/client.js';
import { connectorInstances } from '@/db/schema.js';

vi.mock('@/db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/connectors/registry.js', () => ({
  getConnectorDefinition: vi.fn(),
}));

vi.mock('@/connectors/auth/oauth-credentials.js', () => ({
  resolveOAuthCredentials: vi.fn(),
}));

vi.mock('@/connectors/auth/oauth2.js', async () => {
  const actual = await vi.importActual<typeof import('@/connectors/auth/oauth2.js')>(
    '@/connectors/auth/oauth2.js',
  );
  return {
    ...actual,
    refreshAccessToken: vi.fn(),
  };
});

type DbState = {
  instances: ConnectorInstance[];
  updates: Array<Record<string, unknown>>;
};

function createMockDb(state: DbState) {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => (table === connectorInstances ? state.instances : []),
      }),
    }),
    update: (table: unknown) => {
      if (table !== connectorInstances) {
        throw new Error('Unexpected table in update');
      }

      return {
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(values);
          },
        }),
      };
    },
  };
}

function createInstance(): ConnectorInstance {
  return {
    id: 'conn_refresh' as PrefixedString<'conn'>,
    connectorId: 'google',
    label: 'Google Account',
    appliedVersion: 1,
    capabilities: ['google.drive.read'],
    clientId: 'client-id',
    clientSecret: 'client-secret',
    apiKey: null,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    tokenExpiresAt: Date.now() - 1_000,
    scopes: ['scope:read'],
    status: 'connected',
    authIssue: null,
    accountEmail: 'user@example.com',
    accountInfo: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createDefinition(): ConnectorDefinition {
  return {
    id: 'google',
    name: 'Google',
    description: 'Google',
    icon: { type: 'simpleIcons', slug: 'google' },
    enabled: true,
    currentVersion: 1,
    versionHistory: [],
    authType: 'oauth2',
    authConfig: {
      authUrl: 'https://example.com/auth',
      tokenUrl: 'https://example.com/token',
      scopeDescriptions: {},
      defaultScopes: [],
    },
    setupInstructions: [],
  };
}

describe('refreshExpiringTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('keeps connector connected when refresh fails transiently', async () => {
    const state: DbState = { instances: [createInstance()], updates: [] };
    vi.mocked(getDb).mockReturnValue(createMockDb(state) as never);
    vi.mocked(getConnectorDefinition).mockReturnValue(createDefinition());
    vi.mocked(resolveOAuthCredentials).mockResolvedValue({
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error('socket hang up'));

    await refreshExpiringTokens();

    expect(state.updates).toHaveLength(0);
  });

  test('marks connector errored when refresh token is revoked', async () => {
    const state: DbState = { instances: [createInstance()], updates: [] };
    vi.mocked(getDb).mockReturnValue(createMockDb(state) as never);
    vi.mocked(getConnectorDefinition).mockReturnValue(createDefinition());
    vi.mocked(resolveOAuthCredentials).mockResolvedValue({
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });
    vi.mocked(refreshAccessToken).mockRejectedValue(
      new OAuthRefreshError(
        400,
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        }),
      ),
    );

    await refreshExpiringTokens();

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]?.['status']).toBe('error');
  });
});
