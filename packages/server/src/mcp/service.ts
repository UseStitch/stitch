import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { and, asc, eq, like, or } from 'drizzle-orm';

import { createMcpServerId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type { McpAuthConfig, McpTool, McpTransport, OAuthAuth } from '@stitch/shared/mcp/types';

import { getDb } from '@/db/client.js';
import { mcpServers } from '@/db/schema/mcp.js';
import { toolEnabled, toolPermissions } from '@/db/schema/permissions.js';
import * as Log from '@/lib/log.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import {
  clearPendingOAuthTransport,
  getPendingOAuthTransport,
  registerPendingOAuthTransport,
  withMcpClient,
} from '@/mcp/client.js';
import * as OAuthCallback from '@/mcp/oauth-callback.js';
import { McpOAuthProvider, setMcpAuthStatus } from '@/mcp/oauth-provider.js';
import { refreshMcpToolsets } from '@/mcp/tool-executor.js';

const log = Log.create({ service: 'mcp-service' });

type McpServerRow = typeof mcpServers.$inferSelect;

export async function listMcpServers(): Promise<ServiceResult<McpServerRow[]>> {
  const db = getDb();
  const servers = await db.select().from(mcpServers).orderBy(asc(mcpServers.createdAt));
  return ok(servers);
}

export async function createMcpServer(input: {
  name: string;
  transport: McpTransport;
  url: string;
  authConfig: McpAuthConfig;
}): Promise<ServiceResult<{ id: string }>> {
  const db = getDb();
  const id = createMcpServerId();
  await db
    .insert(mcpServers)
    .values({ id, name: input.name, transport: input.transport, url: input.url, authConfig: input.authConfig });
  return ok({ id });
}

export async function deleteMcpServer(serverId: string): Promise<ServiceResult<null>> {
  const db = getDb();
  const toolsetId = `mcp:${serverId}`;
  const mcpToolPrefix = `${serverId}_%`;

  const [existing] = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.id, serverId as PrefixedString<'mcp'>));
  if (!existing) {
    return err('MCP server not found', 404);
  }

  await db.delete(mcpServers).where(eq(mcpServers.id, serverId as PrefixedString<'mcp'>));
  await db
    .delete(toolEnabled)
    .where(
      or(
        and(eq(toolEnabled.scope, 'toolset'), eq(toolEnabled.identifier, toolsetId)),
        and(eq(toolEnabled.scope, 'mcp_tool'), like(toolEnabled.identifier, mcpToolPrefix)),
      ),
    );
  await db.delete(toolPermissions).where(like(toolPermissions.toolName, mcpToolPrefix));

  return ok(null);
}

export async function fetchMcpTools(serverId: string): Promise<ServiceResult<McpTool[]>> {
  const db = getDb();
  const [server] = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.id, serverId as PrefixedString<'mcp'>));
  if (!server) {
    return err('MCP server not found', 404);
  }

  let rawTools: Record<string, unknown>;
  try {
    const result = await withMcpClient(server, (client) => client.listTools());
    rawTools = Object.fromEntries(result.tools.map((tool) => [tool.name, tool]));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`MCP server error: ${message}`, 400);
  }

  // Map SDK tool objects to our lightweight cached shape
  const tools: McpTool[] = Object.entries(rawTools).map(([name, toolDef]) => {
    const def = toolDef as {
      title?: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
      annotations?: McpTool['annotations'];
      icons?: McpTool['icons'];
    };
    return {
      name,
      title: def.title,
      description: def.description,
      inputSchema: def.inputSchema,
      annotations: def.annotations,
      icons: def.icons,
    };
  });

  // Persist tools to cache
  await db
    .update(mcpServers)
    .set({ tools, updatedAt: Date.now() })
    .where(eq(mcpServers.id, serverId as PrefixedString<'mcp'>));

  return ok(tools);
}

export type McpServerWithTools = {
  id: PrefixedString<'mcp'>;
  name: string;
  url: string;
  authConfig: McpAuthConfig;
  tools: McpTool[] | null;
};

export async function getMcpServersWithCachedTools(): Promise<McpServerWithTools[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: mcpServers.id,
      name: mcpServers.name,
      url: mcpServers.url,
      authConfig: mcpServers.authConfig,
      tools: mcpServers.tools,
    })
    .from(mcpServers)
    .orderBy(asc(mcpServers.createdAt));

  return rows;
}

function isClientRegistrationError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes('registration') || message.includes('client_id');
}

async function loadOAuthServer(
  serverId: string,
): Promise<ServiceResult<{ id: PrefixedString<'mcp'>; url: string; authConfig: OAuthAuth }>> {
  const db = getDb();
  const [server] = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.id, serverId as PrefixedString<'mcp'>));
  if (!server) {
    return err('MCP server not found', 404);
  }
  if (server.authConfig.type !== 'oauth') {
    return err('MCP server is not configured for OAuth', 400);
  }
  return ok({ id: server.id, url: server.url, authConfig: server.authConfig });
}

/**
 * Begin the OAuth flow for an MCP server. Builds the provider + transport,
 * registers the transport so `finishAuth` can later run on the same instance,
 * then lets the SDK perform discovery + DCR and capture the authorization URL.
 */
export async function startMcpAuth(
  serverId: string,
): Promise<ServiceResult<{ authUrl: string; waitForTokens: () => Promise<void> }>> {
  const loaded = await loadOAuthServer(serverId);
  if (loaded.error) return loaded;
  const server = loaded.data;

  await OAuthCallback.ensureRunning();
  const provider = new McpOAuthProvider(server);
  const transport = new StreamableHTTPClientTransport(new URL(server.url), { authProvider: provider });
  registerPendingOAuthTransport(server.id, transport);

  const state = provider.state();

  let result: Awaited<ReturnType<typeof auth>>;
  try {
    result = await auth(provider, { serverUrl: server.url });
  } catch (error) {
    clearPendingOAuthTransport(server.id);
    if (isClientRegistrationError(error)) {
      await setMcpAuthStatus(server.id, 'client_registration_required');
    } else {
      await setMcpAuthStatus(server.id, 'error');
    }
    const message = error instanceof Error ? error.message : String(error);
    return err(`Failed to start MCP authorization: ${message}`, 400);
  }

  if (result === 'AUTHORIZED') {
    clearPendingOAuthTransport(server.id);
    await setMcpAuthStatus(server.id, 'connected');
    await refreshMcpToolsets({ serverIds: [server.id], refreshTools: true });
    return ok({ authUrl: '', waitForTokens: () => Promise.resolve() });
  }

  const authorizationUrl = provider.authorizationUrl;
  if (!authorizationUrl) {
    clearPendingOAuthTransport(server.id);
    await setMcpAuthStatus(server.id, 'error');
    return err('Authorization URL was not produced by the OAuth flow', 400);
  }

  // The SDK builds the authorization URL with its own `state`; use that value
  // as the CSRF key so the callback can match the returned `state`.
  const builtState = authorizationUrl.searchParams.get('state') ?? state;
  const codePromise = OAuthCallback.registerPendingAuth({ state: builtState, serverId: server.id });
  await setMcpAuthStatus(server.id, 'awaiting_auth');

  const waitForTokens = async (): Promise<void> => {
    try {
      const code = await codePromise;
      const pendingTransport = getPendingOAuthTransport(server.id) ?? transport;
      await pendingTransport.finishAuth(code);
      await setMcpAuthStatus(server.id, 'connected');
      await refreshMcpToolsets({ serverIds: [server.id], refreshTools: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(
        { event: 'mcp.oauth.wait_failed', serverId: server.id, error: message },
        'MCP OAuth token exchange failed',
      );
      await setMcpAuthStatus(server.id, 'error');
      throw error;
    } finally {
      clearPendingOAuthTransport(server.id);
    }
  };

  return ok({ authUrl: authorizationUrl.toString(), waitForTokens });
}

/** Clear OAuth credentials and tear down any in-flight auth for a server. */
export async function logoutMcpAuth(serverId: string): Promise<ServiceResult<null>> {
  const loaded = await loadOAuthServer(serverId);
  if (loaded.error) return loaded;

  OAuthCallback.cancelPending(serverId);
  clearPendingOAuthTransport(serverId);
  const provider = new McpOAuthProvider(loaded.data);
  await provider.invalidateCredentials('all');
  await setMcpAuthStatus(loaded.data.id, 'none');
  return ok(null);
}

export async function getMcpAuthStatus(
  serverId: string,
): Promise<ServiceResult<{ authStatus: McpServerRow['authStatus'] }>> {
  const db = getDb();
  const [server] = await db
    .select({ authStatus: mcpServers.authStatus })
    .from(mcpServers)
    .where(eq(mcpServers.id, serverId as PrefixedString<'mcp'>));
  if (!server) {
    return err('MCP server not found', 404);
  }
  return ok({ authStatus: server.authStatus });
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

/**
 * Refresh soon-to-expire OAuth tokens for connected MCP servers. The SDK
 * performs the refresh through the provider when a transport is opened, so we
 * reuse the transport-with-`authProvider` path rather than a bespoke call.
 */
export async function refreshExpiringMcpTokens(): Promise<void> {
  const db = getDb();
  const servers = await db.select().from(mcpServers).where(eq(mcpServers.authStatus, 'connected'));

  const now = Date.now();
  for (const server of servers) {
    if (server.authConfig.type !== 'oauth') continue;

    const provider = new McpOAuthProvider({ id: server.id, url: server.url, authConfig: server.authConfig });
    const tokens = await provider.tokens();
    if (!tokens?.refresh_token || tokens.expires_in === undefined) continue;

    const session = await db
      .select({ updatedAt: mcpServers.updatedAt })
      .from(mcpServers)
      .where(eq(mcpServers.id, server.id));
    const issuedAt = session[0]?.updatedAt ?? now;
    const expiresAt = issuedAt + tokens.expires_in * 1000;
    if (expiresAt - now > TOKEN_REFRESH_BUFFER_MS) continue;

    try {
      const transport = new StreamableHTTPClientTransport(new URL(server.url), { authProvider: provider });
      await auth(provider, { serverUrl: server.url });
      await transport.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn({ event: 'mcp.token_refresh.failed', serverId: server.id, error: message }, 'MCP token refresh failed');
      await setMcpAuthStatus(server.id, 'reauthorization_required');
    }
  }
}
