import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { createMcpServerId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type { McpAuthConfig } from '@stitch/shared/mcp/types';

import { getDb } from '@/db/client.js';
import { mcpOAuthSessions, mcpServers } from '@/db/schema/mcp.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { getMcpAuthStatus, logoutMcpAuth, startMcpAuth } from '@/mcp/service.js';

setupTestDb();

async function seed(authConfig: McpAuthConfig): Promise<PrefixedString<'mcp'>> {
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

describe('mcp auth service', () => {
  test('getMcpAuthStatus returns 404 for unknown servers', async () => {
    const result = await getMcpAuthStatus('mcp_does_not_exist');
    expect(result.error?.status).toBe(404);
  });

  test('getMcpAuthStatus returns the stored status', async () => {
    const id = await seed({ type: 'oauth' });
    const result = await getMcpAuthStatus(id);
    expect(result.data?.authStatus).toBe('none');
  });

  test('startMcpAuth rejects non-oauth servers', async () => {
    const id = await seed({ type: 'none' });
    const result = await startMcpAuth(id);
    expect(result.error?.status).toBe(400);
  });

  test('logoutMcpAuth clears the session row and resets status', async () => {
    const id = await seed({ type: 'oauth' });
    const db = getDb();
    await db.insert(mcpOAuthSessions).values({
      serverId: id,
      tokens: { access_token: 'at', token_type: 'Bearer' },
    });
    await db.update(mcpServers).set({ authStatus: 'connected' }).where(eq(mcpServers.id, id));

    const result = await logoutMcpAuth(id);
    expect(result.error).toBeNull();

    const sessions = await db
      .select()
      .from(mcpOAuthSessions)
      .where(eq(mcpOAuthSessions.serverId, id));
    expect(sessions).toHaveLength(0);

    const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, id));
    expect(server?.authStatus).toBe('none');
  });
});
