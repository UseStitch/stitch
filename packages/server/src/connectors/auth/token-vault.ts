import { and, eq, isNotNull, lt } from 'drizzle-orm';

import type { OAuthConfig } from '@stitch/shared/connectors/types';

import { resolveOAuthCredentials } from '@/connectors/auth/oauth-credentials.js';
import {
  refreshAccessToken as refreshAccessTokenDefault,
  requiresOAuthReauth,
  type refreshAccessToken as RefreshAccessTokenFn,
} from '@/connectors/auth/oauth2.js';
import { withRefreshLock } from '@/connectors/auth/refresh-lock.js';
import { getConnectorDefinition } from '@/connectors/registry.js';
import { getDb } from '@/db/client.js';
import { connectorInstances } from '@/db/schema/connectors.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';

type ConnectorInstanceRow = typeof connectorInstances.$inferSelect;

const log = Log.create({ service: 'token-vault' });

const REFRESH_BUFFER_MS = 5 * 60_000;
const MAX_REFRESH_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1_000;

export type TokenRefreshDeps = {
  refreshAccessToken?: typeof RefreshAccessTokenFn;
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_DEPS: Required<TokenRefreshDeps> = {
  refreshAccessToken: refreshAccessTokenDefault,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Refreshes a token, retrying transient failures with exponential backoff.
 * Permanent failures (revoked/expired refresh token) are thrown immediately
 * without retrying, since retrying cannot recover them.
 */
async function refreshAccessTokenWithRetries(
  refresh: typeof RefreshAccessTokenFn,
  args: Parameters<typeof RefreshAccessTokenFn>,
  sleepFn: (ms: number) => Promise<void>,
): Promise<Awaited<ReturnType<typeof RefreshAccessTokenFn>>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_REFRESH_ATTEMPTS; attempt += 1) {
    try {
      return await refresh(...args);
    } catch (error) {
      lastError = error;
      if (requiresOAuthReauth(error) || attempt === MAX_REFRESH_ATTEMPTS) {
        throw error;
      }
      await sleepFn(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

/**
 * Logs a refresh failure and, when the refresh token is permanently revoked,
 * marks the connector for reauthorization.
 */
async function markRefreshFailure(row: ConnectorInstanceRow, error: unknown): Promise<void> {
  const message = Error.isError(error) ? error.message : String(error);
  const requiresReauth = requiresOAuthReauth(error);
  log.error(
    { event: 'token-refresh.failed', instanceId: row.id, label: row.label, requiresReauth, error: message },
    requiresReauth
      ? `Token refresh failed for ${row.label} and requires reauthorization`
      : `Token refresh failed for ${row.label}`,
  );

  if (requiresReauth) {
    await getDb()
      .update(connectorInstances)
      .set({ status: 'error', authIssue: 'reauthorization_required', updatedAt: Date.now() })
      .where(eq(connectorInstances.id, row.id));
    internalBus.emit('connector.auth.failed', { instanceId: row.id });
  }
}

/**
 * Exchanges a connector's refresh token for a fresh access token, writes it
 * back to the DB, and emits the refresh event. Returns the new access token,
 * or `null` when the connector cannot be refreshed at all. On a refresh
 * failure the error is logged (and, if permanent, the connector marked) before
 * being rethrown so callers can react.
 */
async function refreshConnectorToken(row: ConnectorInstanceRow, deps: TokenRefreshDeps = {}): Promise<string | null> {
  const definition = getConnectorDefinition(row.connectorId);
  if (!definition || definition.authType !== 'oauth2' || !row.refreshToken) return null;

  const credentials = await resolveOAuthCredentials(row);
  if (!credentials) return null;

  const config = definition.authConfig as OAuthConfig;
  const refreshFn = deps.refreshAccessToken ?? DEFAULT_DEPS.refreshAccessToken;
  const sleepFn = deps.sleep ?? DEFAULT_DEPS.sleep;

  try {
    const tokens = await withRefreshLock(row.id, () =>
      refreshAccessTokenWithRetries(
        refreshFn,
        [config.tokenUrl, credentials.clientId, credentials.clientSecret, row.refreshToken as string],
        sleepFn,
      ),
    );

    await getDb()
      .update(connectorInstances)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? row.refreshToken,
        tokenExpiresAt: tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : null,
        status: 'connected',
        authIssue: null,
        updatedAt: Date.now(),
      })
      .where(eq(connectorInstances.id, row.id));

    internalBus.emit('connector.token.refreshed', { instanceId: row.id });
    return tokens.accessToken;
  } catch (error) {
    await markRefreshFailure(row, error);
    throw error;
  }
}

export type TokenRefreshOpts = { forceRefresh?: boolean };

/**
 * Returns a usable access token for a connector instance, refreshing it on
 * demand when it is expired, near expiry, or explicitly requested. `null` when
 * no token can be obtained (missing instance, missing refresh token, or a
 * refresh failure — which is thrown).
 */
export async function ensureFreshAccessToken(
  instanceId: string,
  opts: TokenRefreshOpts = {},
  deps: TokenRefreshDeps = {},
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(connectorInstances)
    .where(eq(connectorInstances.id, instanceId as never));

  const now = Date.now();
  const shouldRefresh =
    Boolean(row.refreshToken) &&
    (opts.forceRefresh === true ||
      row.accessToken === null ||
      (row.tokenExpiresAt !== null && row.tokenExpiresAt <= now + REFRESH_BUFFER_MS));

  if (!shouldRefresh) return row.accessToken ?? null;
  return refreshConnectorToken(row, deps);
}

/**
 * Sweeps all connected OAuth2 connector instances whose tokens are expiring
 * soon and refreshes each. Failures are logged and, for permanently revoked
 * refresh tokens, marked for reauthorization — the sweep continues regardless.
 */
export async function refreshExpiringTokens(deps: TokenRefreshDeps = {}): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const threshold = now + REFRESH_BUFFER_MS;

  const expiring = await db
    .select()
    .from(connectorInstances)
    .where(
      and(
        eq(connectorInstances.status, 'connected'),
        isNotNull(connectorInstances.refreshToken),
        isNotNull(connectorInstances.tokenExpiresAt),
        lt(connectorInstances.tokenExpiresAt, threshold),
      ),
    );

  for (const row of expiring) {
    try {
      await refreshConnectorToken(row, deps);
    } catch {
      // refreshConnectorToken already logged and (on permanent failure) marked the connector.
    }
  }
}
