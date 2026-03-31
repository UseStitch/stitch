import { eq, and, isNotNull, lt } from 'drizzle-orm';

import type { OAuthConfig } from '@stitch/shared/connectors/types';

import { getDb } from '@/db/client.js';
import { connectorInstances } from '@/db/schema.js';
import { resolveOAuthCredentials } from '@/connectors/auth/oauth-credentials.js';
import { refreshAccessToken } from '@/connectors/auth/oauth2.js';
import { getConnectorDefinition } from '@/connectors/registry.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'token-refresh' });

const REFRESH_INTERVAL_MS = 60_000; // Check every minute
const REFRESH_BUFFER_MS = 5 * 60_000; // Refresh 5 minutes before expiry

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startTokenRefreshService(): void {
  if (intervalId) return;

  intervalId = setInterval(() => {
    void refreshExpiringTokens();
  }, REFRESH_INTERVAL_MS);

  log.info({ event: 'token-refresh.started' }, 'Token refresh service started');
}

export function stopTokenRefreshService(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    log.info({ event: 'token-refresh.stopped' }, 'Token refresh service stopped');
  }
}

async function refreshExpiringTokens(): Promise<void> {
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

      if (!instance.refreshToken) continue;

      const credentials = await resolveOAuthCredentials(instance);
      if (!credentials) continue;

      log.info(
        { event: 'token-refresh.refreshing', instanceId: instance.id, label: instance.label },
        `Refreshing token for ${instance.label}`,
      );

      const tokens = await refreshAccessToken(
        config.tokenUrl,
        credentials.clientId,
        credentials.clientSecret,
        instance.refreshToken,
      );

      await db
        .update(connectorInstances)
        .set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? instance.refreshToken,
          tokenExpiresAt: tokens.expiresIn ? now + tokens.expiresIn * 1000 : null,
          status: 'connected',
          updatedAt: Date.now(),
        })
        .where(eq(connectorInstances.id, instance.id));

      log.info(
        { event: 'token-refresh.success', instanceId: instance.id },
        `Token refreshed for ${instance.label}`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error(
        { event: 'token-refresh.failed', instanceId: instance.id, error: message },
        `Token refresh failed for ${instance.label}`,
      );

      await db
        .update(connectorInstances)
        .set({ status: 'error', updatedAt: Date.now() })
        .where(eq(connectorInstances.id, instance.id));
    }
  }
}
