import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { ConnectorDefinition } from '@stitch/shared/connectors/types';
import type { PrefixedString } from '@stitch/shared/id';

import { OAuthRefreshError } from '@/connectors/auth/oauth2.js';
import { refreshExpiringTokens } from '@/connectors/auth/token-refresh.js';
import { registerConnector, unregisterConnector } from '@/connectors/registry.js';
import { getDb } from '@/db/client.js';
import { connectorInstances, connectors } from '@/db/schema/connectors.js';
import { setupTestDb } from '@/db/test-helpers.js';

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
  const connectorRefId = `cnr_${id}` as PrefixedString<'cnr'>;
  await getDb()
    .insert(connectors)
    .values({
      id: connectorRefId,
      connectorId: 'google',
      authType: 'oauth2',
      label: 'Google OAuth App',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      apiKey: null,
    });

  await getDb()
    .insert(connectorInstances)
    .values({
      id: id as PrefixedString<'conn'>,
      connectorId: 'google',
      connectorRefId,
      label: 'Google Account',
      appliedVersion: 1,
      capabilities: ['google.drive.read'],
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
      refreshAccessToken: async () => {
        throw new Error('socket hang up');
      },
      sleep: async () => {},
    });

    const [row] = await getDb()
      .select()
      .from(connectorInstances)
      .where(eq(connectorInstances.id, 'conn_refresh_1' as never));
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

    const [row] = await getDb()
      .select()
      .from(connectorInstances)
      .where(eq(connectorInstances.id, 'conn_refresh_2' as never));
    expect(row?.status).toBe('error');
    expect(row?.authIssue).toBe('reauthorization_required');
  });

  test('recovers after a transient refresh failure by retrying', async () => {
    await insertExpiredInstance('conn_refresh_retry');

    let attempts = 0;
    await refreshExpiringTokens({
      refreshAccessToken: async () => {
        attempts += 1;
        if (attempts < 2) throw new Error('socket hang up');
        return { accessToken: 'refreshed-access', refreshToken: 'rotated-refresh', expiresIn: 3600 };
      },
      sleep: async () => {},
    });

    expect(attempts).toBe(2);
    const [row] = await getDb()
      .select()
      .from(connectorInstances)
      .where(eq(connectorInstances.id, 'conn_refresh_retry' as never));
    expect(row?.status).toBe('connected');
    expect(row?.accessToken).toBe('refreshed-access');
    expect(row?.refreshToken).toBe('rotated-refresh');
  });

  test('does not retry permanent invalid_grant failures', async () => {
    await insertExpiredInstance('conn_refresh_no_retry');

    let attempts = 0;
    await refreshExpiringTokens({
      refreshAccessToken: async () => {
        attempts += 1;
        throw new OAuthRefreshError(400, JSON.stringify({ error: 'invalid_grant' }));
      },
      sleep: async () => {},
    });

    expect(attempts).toBe(1);
    const [row] = await getDb()
      .select()
      .from(connectorInstances)
      .where(eq(connectorInstances.id, 'conn_refresh_no_retry' as never));
    expect(row?.status).toBe('error');
    expect(row?.authIssue).toBe('reauthorization_required');
  });
});
