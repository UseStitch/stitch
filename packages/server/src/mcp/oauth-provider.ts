import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';
import type { McpAuthStatus, OAuthAuth } from '@stitch/shared/mcp/types';

import { getDb } from '@/db/client.js';
import { mcpOAuthSessions, mcpServers } from '@/db/schema/mcp.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { getMcpOAuthRedirectUri } from '@/mcp/oauth-callback.js';
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from '@modelcontextprotocol/sdk/client/auth.js';

const log = Log.create({ service: 'mcp-oauth-provider' });

const CLIENT_NAME = 'Stitch';
const CLIENT_URI = 'https://usestitch.ai';

type OAuthClientInformationMixed = OAuthClientInformation | OAuthClientInformationFull;

type McpOAuthServerRef = {
  id: PrefixedString<'mcp'>;
  url: string;
  authConfig: OAuthAuth;
};

/** Persist an auth-status transition and notify the FE via the SSE bridge. */
export async function setMcpAuthStatus(
  serverId: PrefixedString<'mcp'>,
  status: McpAuthStatus,
): Promise<void> {
  const db = getDb();
  await db
    .update(mcpServers)
    .set({ authStatus: status, updatedAt: Date.now() })
    .where(eq(mcpServers.id, serverId));
  internalBus.emit('mcp.auth.status_changed', { serverId, authStatus: status });
}

/**
 * SQLite-backed implementation of the MCP SDK's `OAuthClientProvider`. The SDK
 * drives the full spec-compliant flow (RFC 9728 / 8414 discovery, RFC 7591 DCR,
 * PKCE, refresh-on-401); this class supplies persistence and the interactive
 * redirect URL capture.
 */
export class McpOAuthProvider implements OAuthClientProvider {
  private readonly serverId: PrefixedString<'mcp'>;
  private readonly authConfig: OAuthAuth;
  private capturedAuthorizationUrl: URL | null = null;

  constructor(server: McpOAuthServerRef) {
    this.serverId = server.id;
    this.authConfig = server.authConfig;
  }

  get redirectUrl(): string {
    return getMcpOAuthRedirectUri();
  }

  get clientMetadata(): OAuthClientMetadata {
    const hasManualSecret = Boolean(this.authConfig.clientSecret);
    return {
      client_name: CLIENT_NAME,
      client_uri: CLIENT_URI,
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: hasManualSecret ? 'client_secret_post' : 'none',
      scope: this.authConfig.scopes?.join(' '),
    };
  }

  /** The authorization URL captured during the most recent `auth()` call. */
  get authorizationUrl(): URL | null {
    return this.capturedAuthorizationUrl;
  }

  private async getSession() {
    const db = getDb();
    const [row] = await db
      .select()
      .from(mcpOAuthSessions)
      .where(eq(mcpOAuthSessions.serverId, this.serverId));
    return row ?? null;
  }

  private async upsertSession(values: Partial<typeof mcpOAuthSessions.$inferInsert>): Promise<void> {
    const db = getDb();
    await db
      .insert(mcpOAuthSessions)
      .values({ serverId: this.serverId, ...values })
      .onConflictDoUpdate({
        target: mcpOAuthSessions.serverId,
        set: { ...values, updatedAt: Date.now() },
      });
  }

  state(): string {
    return crypto.randomUUID();
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    if (this.authConfig.clientId) {
      return {
        client_id: this.authConfig.clientId,
        client_secret: this.authConfig.clientSecret,
      };
    }
    const session = await this.getSession();
    return session?.clientInformation ?? undefined;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    await this.upsertSession({ clientInformation });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const session = await this.getSession();
    return (session?.tokens as OAuthTokens | undefined) ?? undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.upsertSession({ tokens });
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.capturedAuthorizationUrl = authorizationUrl;
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.upsertSession({ codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const session = await this.getSession();
    if (!session?.codeVerifier) {
      throw new Error('No PKCE code verifier saved for MCP OAuth session');
    }
    return session.codeVerifier;
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    await this.upsertSession({ discoveryState: state as unknown as Record<string, unknown> });
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    const session = await this.getSession();
    return (session?.discoveryState as unknown as OAuthDiscoveryState | undefined) ?? undefined;
  }

  async invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery',
  ): Promise<void> {
    const db = getDb();
    log.info({ event: 'mcp.oauth.invalidate', serverId: this.serverId, scope }, 'invalidating MCP OAuth credentials');

    if (scope === 'all') {
      await db.delete(mcpOAuthSessions).where(eq(mcpOAuthSessions.serverId, this.serverId));
      await setMcpAuthStatus(this.serverId, 'reauthorization_required');
      return;
    }

    const patch: Partial<typeof mcpOAuthSessions.$inferInsert> = {};
    if (scope === 'client') patch.clientInformation = null;
    if (scope === 'tokens') patch.tokens = null;
    if (scope === 'verifier') patch.codeVerifier = null;
    if (scope === 'discovery') patch.discoveryState = null;

    await db
      .update(mcpOAuthSessions)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(mcpOAuthSessions.serverId, this.serverId));

    if (scope === 'tokens') {
      await setMcpAuthStatus(this.serverId, 'reauthorization_required');
    }
  }
}
