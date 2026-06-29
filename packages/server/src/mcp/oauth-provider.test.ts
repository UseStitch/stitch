import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { createMcpServerId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type { OAuthAuth } from '@stitch/shared/mcp/types';

import { getDb } from '@/db/client.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { mcpOAuthSessions, mcpServers } from '@/db/schema/mcp.js';
import { McpOAuthProvider } from '@/mcp/oauth-provider.js';

setupTestDb();

async function seedServer(authConfig: OAuthAuth): Promise<PrefixedString<'mcp'>> {
  const id = createMcpServerId();
  await getDb().insert(mcpServers).values({
    id,
    name: 'Test',
    transport: 'http',
    url: 'https://mcp.example.com',
    authConfig,
  });
  return id;
}

function makeProvider(id: PrefixedString<'mcp'>, authConfig: OAuthAuth): McpOAuthProvider {
  return new McpOAuthProvider({ id, url: 'https://mcp.example.com', authConfig });
}

describe('McpOAuthProvider', () => {
  let serverId: PrefixedString<'mcp'>;

  beforeEach(async () => {
    serverId = await seedServer({ type: 'oauth' });
  });

  test('clientMetadata uses none auth method and joins scopes when no manual secret', () => {
    const provider = makeProvider(serverId, { type: 'oauth', scopes: ['read', 'write'] });
    const metadata = provider.clientMetadata;
    expect(metadata.token_endpoint_auth_method).toBe('none');
    expect(metadata.response_types).toEqual(['code']);
    expect(metadata.grant_types).toEqual(['authorization_code', 'refresh_token']);
    expect(metadata.scope).toBe('read write');
  });

  test('clientMetadata uses client_secret_post when a manual secret is supplied', () => {
    const provider = makeProvider(serverId, { type: 'oauth', clientSecret: 'shh' });
    expect(provider.clientMetadata.token_endpoint_auth_method).toBe('client_secret_post');
  });

  test('clientInformation returns manual credentials when provided', async () => {
    const provider = makeProvider(serverId, {
      type: 'oauth',
      clientId: 'manual-id',
      clientSecret: 'manual-secret',
    });
    const info = await provider.clientInformation();
    expect(info).toEqual({ client_id: 'manual-id', client_secret: 'manual-secret' });
  });

  test('clientInformation round-trips DCR result when no manual credentials', async () => {
    const provider = makeProvider(serverId, { type: 'oauth' });
    expect(await provider.clientInformation()).toBeUndefined();

    await provider.saveClientInformation({
      client_id: 'dcr-id',
      client_secret: 'dcr-secret',
    });
    expect(await provider.clientInformation()).toEqual({
      client_id: 'dcr-id',
      client_secret: 'dcr-secret',
    });
  });

  test('tokens and code verifier round-trip through the DB', async () => {
    const provider = makeProvider(serverId, { type: 'oauth' });

    await provider.saveTokens({ access_token: 'at', token_type: 'Bearer', refresh_token: 'rt' });
    expect(await provider.tokens()).toMatchObject({ access_token: 'at', refresh_token: 'rt' });

    await provider.saveCodeVerifier('verifier-123');
    expect(await provider.codeVerifier()).toBe('verifier-123');
  });

  test('codeVerifier throws when none is saved', async () => {
    const provider = makeProvider(serverId, { type: 'oauth' });
     expect(provider.codeVerifier()).rejects.toThrow();
  });

  test('redirectToAuthorization captures the URL', () => {
    const provider = makeProvider(serverId, { type: 'oauth' });
    const url = new URL('https://auth.example.com/authorize?state=abc');
    provider.redirectToAuthorization(url);
    expect(provider.authorizationUrl?.toString()).toBe(url.toString());
  });

  test('invalidateCredentials("tokens") clears only tokens and flags reauthorization', async () => {
    const provider = makeProvider(serverId, { type: 'oauth' });
    await provider.saveClientInformation({ client_id: 'dcr-id' });
    await provider.saveTokens({ access_token: 'at', token_type: 'Bearer' });

    await provider.invalidateCredentials('tokens');

    expect(await provider.tokens()).toBeUndefined();
    expect(await provider.clientInformation()).toEqual({ client_id: 'dcr-id' });
    const [server] = await getDb()
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, serverId));
    expect(server?.authStatus).toBe('reauthorization_required');
  });

  test('invalidateCredentials("client") clears only client information', async () => {
    const provider = makeProvider(serverId, { type: 'oauth' });
    await provider.saveClientInformation({ client_id: 'dcr-id' });
    await provider.saveTokens({ access_token: 'at', token_type: 'Bearer' });

    await provider.invalidateCredentials('client');

    expect(await provider.clientInformation()).toBeUndefined();
    expect(await provider.tokens()).toMatchObject({ access_token: 'at' });
  });

  test('invalidateCredentials("all") deletes the whole session row', async () => {
    const provider = makeProvider(serverId, { type: 'oauth' });
    await provider.saveTokens({ access_token: 'at', token_type: 'Bearer' });

    await provider.invalidateCredentials('all');

    const rows = await getDb()
      .select()
      .from(mcpOAuthSessions)
      .where(eq(mcpOAuthSessions.serverId, serverId));
    expect(rows).toHaveLength(0);
  });
});
