import { eq, and, isNotNull, lt } from 'drizzle-orm';

import type { OAuthConfig } from '@stitch/shared/connectors/types';

import { resolveOAuthCredentials } from '@/connectors/auth/oauth-credentials.js';
import {
  refreshAccessToken as refreshAccessTokenDefault,
  requiresOAuthReauth,
} from '@/connectors/auth/oauth2.js';
import type { refreshAccessToken as RefreshAccessTokenFn } from '@/connectors/auth/oauth2.js';
import { withRefreshLock } from '@/connectors/auth/refresh-lock.js';
import { getConnectorDefinition } from '@/connectors/registry.js';
import { getDb } from '@/db/client.js';
import { connectorInstances } from '@/db/schema/connectors.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'token-refresh' });

const REFRESH_BUFFER_MS = 5 * 60_000; // Refresh 5 minutes before expiry
const MAX_REFRESH_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Refreshes a token, retrying transient failures with exponential backoff.
 * Permanent failures (revoked/expired refresh token) are thrown immediately
 * without retrying, since retrying cannot recover them.
 */
async function refreshWithRetries(
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

export async function refreshExpiringTokens(deps?: {
  refreshAccessToken?: typeof RefreshAccessTokenFn;
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
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

  for (const instance of expiring) {
    try {
      const definition = getConnectorDefinition(instance.connectorId);
      if (!definition || definition.authType !== 'oauth2') continue;

      const config = definition.authConfig as OAuthConfig;

      const refreshToken = instance.refreshToken;
      if (!refreshToken) continue;

      const credentials = await resolveOAuthCredentials(instance);
      if (!credentials) continue;

      log.info(
        { event: 'token-refresh.refreshing', instanceId: instance.id, label: instance.label },
        `Refreshing token for ${instance.label}`,
      );

      const tokens = await withRefreshLock(instance.id, () =>
        refreshWithRetries(
          deps?.refreshAccessToken ?? refreshAccessTokenDefault,
          [config.tokenUrl, credentials.clientId, credentials.clientSecret, refreshToken],
          deps?.sleep ?? sleep,
        ),
      );

      await db
        .update(connectorInstances)
        .set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? instance.refreshToken,
          tokenExpiresAt: tokens.expiresIn ? now + tokens.expiresIn * 1000 : null,
          status: 'connected',
          authIssue: null,
          updatedAt: Date.now(),
        })
        .where(eq(connectorInstances.id, instance.id));

      log.info(
        { event: 'token-refresh.success', instanceId: instance.id },
        `Token refreshed for ${instance.label}`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const requiresReauth = requiresOAuthReauth(e);
      log.error(
        {
          event: 'token-refresh.failed',
          instanceId: instance.id,
          label: instance.label,
          requiresReauth,
          error: message,
        },
        requiresReauth
          ? `Token refresh failed for ${instance.label} and requires reauthorization`
          : `Token refresh failed for ${instance.label}`,
      );

      if (requiresReauth) {
        await db
          .update(connectorInstances)
          .set({
            status: 'error',
            authIssue: 'reauthorization_required',
            updatedAt: Date.now(),
          })
          .where(eq(connectorInstances.id, instance.id));
      }
    }
  }
}
