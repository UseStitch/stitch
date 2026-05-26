import { beforeEach, describe, expect, test } from 'bun:test';

import type { ConnectorDefinition } from '@stitch/shared/connectors/types';
import type { PrefixedString } from '@stitch/shared/id';

import { OAuthRefreshError } from '@/connectors/auth/oauth2.js';
import { refreshExpiringTokens } from '@/connectors/auth/token-refresh.js';
import { registerConnector, unregisterConnector } from '@/connectors/registry.js';
import { getDb } from '@/db/client.js';
import { connectorInstances } from '@/db/schema.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { eq } from 'drizzle-orm';

setupTestDb();

function createDefinition(): ConnectorDefinition {
  return {
    id: 'google',
    name: 'Google',
    description: 'Google',
    icon: { type: 'simpleIcons', slug: 'google' },
    enabled: true,
    currentVersion: 1,
    versionHistory: [{ version: 1, title: 'Base', description: 'Base', action: 'none', capabilities: [] }],
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

async function insertExpiredInstance(id: string) {
  await getDb().insert(connectorInstances).values({
    id: id as PrefixedString<'conn'>,
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
  });
}

describe('refreshExpiringTokens', () => {
  beforeEach(() => {
    unregisterConnector('google');
    registerConnector(createDefinition());
  });

  test('keeps connector connected when refresh fails transiently', async () => {
    await insertExpiredInstance('conn_refresh_1');

    await refreshExpiringTokens({
      refreshAccessToken: async () => { throw new Error('socket hang up'); },
    });

    const [row] = await getDb().select().from(connectorInstances).where(eq(connectorInstances.id, 'conn_refresh_1' as never));
    expect(row?.status).toBe('connected');
    expect(row?.authIssue).toBeNull();
  });

  test('marks connector errored when refresh token is revoked', async () => {
    await insertExpiredInstance('conn_refresh_2');

    await refreshExpiringTokens({
      refreshAccessToken: async () => {
        throw new OAuthRefreshError(
          400,
          JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
        );
      },
    });

    const [row] = await getDb().select().from(connectorInstances).where(eq(connectorInstances.id, 'conn_refresh_2' as never));
    expect(row?.status).toBe('error');
    expect(row?.authIssue).toBe('reauthorization_required');
  });
});
