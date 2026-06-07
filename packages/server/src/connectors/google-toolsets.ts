/**
 * Bridge between @stitch-connectors/google toolset definitions and the server's
 * toolset registry. Queries connector instances for Google, checks scopes,
 * and registers only the toolsets the user has authorized.
 */

import { eq } from 'drizzle-orm';

import { GoogleClient } from '@stitch-connectors/google/client';
import {
  GOOGLE_TOOLSET_IDS,
  type GoogleToolsetDefinition,
  buildGoogleToolsets,
  canActivateToolset,
} from '@stitch-connectors/google/toolsets';

import type { OAuthConfig } from '@stitch/shared/connectors/types';

import { resolveOAuthCredentials } from '@/connectors/auth/oauth-credentials.js';
import { refreshAccessToken, requiresOAuthReauth } from '@/connectors/auth/oauth2.js';
import { getConnectorDefinition } from '@/connectors/registry.js';
import { getDb } from '@/db/client.js';
import { connectorInstances } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset } from '@/tools/toolsets/types.js';

const log = Log.create({ service: 'google-toolsets' });
const REFRESH_BUFFER_MS = 60_000;

/** Deduplicates concurrent refresh attempts for the same account. */
const refreshInFlight = new Map<string, Promise<string>>();

/** Convert a @stitch-connectors/google toolset definition into the server Toolset type. */
function toServerToolset(def: GoogleToolsetDefinition): Toolset {
  return {
    id: def.id,
    kind: 'connector',
    name: def.name,
    description: def.description,
    icon: def.icon,
    instructions: def.instructions,
    tools: () => def.tools(),
    activate: async () => {
      const clientCache = new Map<string, { client: GoogleClient; usedAccount: string }>();

      return def.activate(async (account) => {
        const cacheKey = account?.trim().toLowerCase() || 'default';
        const cached = clientCache.get(cacheKey);
        if (cached) {
          return cached;
        }

        const db = getDb();
        const rows = await db
          .select({
            id: connectorInstances.id,
            label: connectorInstances.label,
            accountEmail: connectorInstances.accountEmail,
            accessToken: connectorInstances.accessToken,
            refreshToken: connectorInstances.refreshToken,
            tokenExpiresAt: connectorInstances.tokenExpiresAt,
            clientId: connectorInstances.clientId,
            clientSecret: connectorInstances.clientSecret,
            connectorId: connectorInstances.connectorId,
            status: connectorInstances.status,
            scopes: connectorInstances.scopes,
            capabilities: connectorInstances.capabilities,
          })
          .from(connectorInstances)
          .where(eq(connectorInstances.connectorId, 'google'));

        const connected = rows.filter(
          (row) => row.status === 'connected' && Boolean(row.accessToken),
        );
        if (connected.length === 0) {
          throw new Error(
            'No connected Google accounts found. Connect and authorize Google first.',
          );
        }

        const normalized = account?.trim().toLowerCase();
        const chosen = normalized
          ? connected.find((row) => {
              const email = row.accountEmail?.toLowerCase();
              const label = row.label.toLowerCase();
              const id = row.id.toLowerCase();
              return email === normalized || label === normalized || id === normalized;
            })
          : connected[0];

        if (!chosen) {
          const available = connected.map((row) => row.accountEmail ?? row.label).join(', ');
          throw new Error(`Unknown Google account "${account}". Available accounts: ${available}`);
        }

        if (
          !canActivateToolset(def.id, (chosen.scopes as string[]) ?? [], chosen.capabilities ?? [])
        ) {
          throw new Error(
            `Google account ${chosen.accountEmail ?? chosen.label} does not have the permissions required for ${def.name}. Re-authorize this account with the required scopes.`,
          );
        }

        const client = new GoogleClient({
          getAccessToken: async (options) => {
            const forceRefresh = options?.forceRefresh === true;
            const now = Date.now();

            const [latest] = await db
              .select({
                id: connectorInstances.id,
                connectorId: connectorInstances.connectorId,
                accessToken: connectorInstances.accessToken,
                refreshToken: connectorInstances.refreshToken,
                tokenExpiresAt: connectorInstances.tokenExpiresAt,
                clientId: connectorInstances.clientId,
                clientSecret: connectorInstances.clientSecret,
              })
              .from(connectorInstances)
              .where(eq(connectorInstances.id, chosen.id));

            if (!latest) {
              throw new Error(
                `Google account ${chosen.accountEmail ?? chosen.label} is not authorized.`,
              );
            }

            const shouldRefresh =
              Boolean(latest.refreshToken) &&
              (forceRefresh ||
                latest.accessToken === null ||
                (latest.tokenExpiresAt !== null &&
                  latest.tokenExpiresAt <= now + REFRESH_BUFFER_MS));

            if (shouldRefresh) {
              const definition = getConnectorDefinition(latest.connectorId);
              if (definition?.authType === 'oauth2') {
                const creds = await resolveOAuthCredentials(latest);
                if (creds && latest.refreshToken) {
                  const inFlight = refreshInFlight.get(chosen.id);
                  if (inFlight) {
                    return await inFlight;
                  }

                  const config = definition.authConfig as OAuthConfig;
                  const refreshPromise = refreshAccessToken(
                    config.tokenUrl,
                    creds.clientId,
                    creds.clientSecret,
                    latest.refreshToken,
                  );
                  refreshInFlight.set(
                    chosen.id,
                    refreshPromise.then((r) => r.accessToken),
                  );

                  try {
                    const refreshed = await refreshPromise;

                    await db
                      .update(connectorInstances)
                      .set({
                        accessToken: refreshed.accessToken,
                        refreshToken: refreshed.refreshToken ?? latest.refreshToken,
                        tokenExpiresAt: refreshed.expiresIn
                          ? now + refreshed.expiresIn * 1000
                          : null,
                        status: 'connected',
                        authIssue: null,
                        updatedAt: now,
                      })
                      .where(eq(connectorInstances.id, chosen.id));

                    return refreshed.accessToken;
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    const requiresReauth = requiresOAuthReauth(error);
                    log.error(
                      {
                        event: 'google.token.refresh.failed',
                        instanceId: chosen.id,
                        accountEmail: chosen.accountEmail,
                        forceRefresh,
                        requiresReauth,
                        error: message,
                      },
                      requiresReauth
                        ? 'Google token refresh failed and requires reauthorization'
                        : 'Google token refresh failed',
                    );
                    if (requiresReauth) {
                      await db
                        .update(connectorInstances)
                        .set({
                          status: 'error',
                          authIssue: 'reauthorization_required',
                          updatedAt: Date.now(),
                        })
                        .where(eq(connectorInstances.id, chosen.id));
                    }
                    throw error;
                  } finally {
                    refreshInFlight.delete(chosen.id);
                  }
                }
              }
            }

            if (!latest.accessToken) {
              throw new Error(
                `Google account ${chosen.accountEmail ?? chosen.label} has no usable access token. Re-authorize this account.`,
              );
            }

            return latest.accessToken;
          },
          logger: log,
          quotaAccountKey: chosen.id,
        });

        const result = {
          client,
          usedAccount: chosen.accountEmail ?? chosen.label,
        };
        clientCache.set(cacheKey, result);
        return result;
      });
    },
  };
}

/**
 * Register Google toolsets based on connected connector instances.
 * Reads scopes from the DB and only registers toolsets for granted services.
 * Called once at startup.
 */
export async function registerGoogleToolsets(): Promise<void> {
  for (const toolsetId of GOOGLE_TOOLSET_IDS) {
    unregisterToolset(toolsetId);
  }

  const db = getDb();

  const instances = await db
    .select({
      id: connectorInstances.id,
      status: connectorInstances.status,
      accessToken: connectorInstances.accessToken,
      scopes: connectorInstances.scopes,
      capabilities: connectorInstances.capabilities,
      appliedVersion: connectorInstances.appliedVersion,
    })
    .from(connectorInstances)
    .where(eq(connectorInstances.connectorId, 'google'));

  const connected = instances.filter((i) => i.status === 'connected' && i.accessToken);

  if (connected.length === 0) {
    log.info(
      { event: 'google-toolsets.none' },
      'No connected Google instances, skipping toolset registration',
    );
    return;
  }

  const scopes = [...new Set(connected.flatMap((instance) => (instance.scopes as string[]) ?? []))];
  const capabilities = [
    ...new Set(connected.flatMap((instance) => (instance.capabilities as string[] | null) ?? [])),
  ];
  const appliedVersion = Math.max(
    ...connected.map((instance) =>
      Number.isFinite(instance.appliedVersion) ? instance.appliedVersion : 1,
    ),
  );

  const toolsetDefs = buildGoogleToolsets({
    scopes,
    capabilities,
    appliedVersion,
    tempPath: PATHS.tempDir,
  });

  for (const def of toolsetDefs) {
    registerToolset(toServerToolset(def));
  }

  log.info(
    {
      event: 'google-toolsets.registered',
      accountCount: connected.length,
      instanceIds: connected.map((instance) => instance.id),
      toolsets: toolsetDefs.map((d) => d.id),
      scopes,
      capabilities,
      appliedVersion,
    },
    `Registered ${toolsetDefs.length} Google toolset(s) across ${connected.length} account(s)`,
  );
}
