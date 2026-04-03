/**
 * Bridge between @stitch-connectors/google toolset definitions and the server's
 * toolset registry. Queries connector instances for Google, checks scopes,
 * and registers only the toolsets the user has authorized.
 */

import { eq } from 'drizzle-orm';

import { GoogleClient } from '@stitch-connectors/google/client';
import { hasServiceAccess } from '@stitch-connectors/google/scopes';
import {
  GOOGLE_CAPABILITY_CALENDAR_READ,
  GOOGLE_CAPABILITY_DOCS_READ,
  GOOGLE_CAPABILITY_DRIVE_READ,
  GOOGLE_CAPABILITY_GMAIL_READ,
  GOOGLE_TOOLSET_IDS,
  type GoogleToolsetDefinition,
  buildGoogleToolsets,
} from '@stitch-connectors/google/toolsets';
import type { OAuthConfig } from '@stitch/shared/connectors/types';

import { resolveOAuthCredentials } from '@/connectors/auth/oauth-credentials.js';
import { refreshAccessToken } from '@/connectors/auth/oauth2.js';
import { getConnectorDefinition } from '@/connectors/registry.js';
import { getDb } from '@/db/client.js';
import { connectorInstances } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset } from '@/tools/toolsets/types.js';
import type { Tool } from 'ai';

const log = Log.create({ service: 'google-toolsets' });
const REFRESH_BUFFER_MS = 60_000;

function hasCapability(capabilities: string[] | null | undefined, capability: string): boolean {
  return (capabilities ?? []).includes(capability);
}

function accountSupportsToolset(
  toolsetId: string,
  account: { scopes: string[] | null; capabilities: string[] | null },
): boolean {
  const scopes = account.scopes ?? [];
  if (toolsetId === 'google-gmail') {
    return (
      hasServiceAccess(scopes, 'gmail') &&
      hasCapability(account.capabilities, GOOGLE_CAPABILITY_GMAIL_READ)
    );
  }
  if (toolsetId === 'google-drive') {
    return (
      hasServiceAccess(scopes, 'drive') &&
      hasCapability(account.capabilities, GOOGLE_CAPABILITY_DRIVE_READ)
    );
  }
  if (toolsetId === 'google-calendar') {
    return (
      hasServiceAccess(scopes, 'calendar') &&
      hasCapability(account.capabilities, GOOGLE_CAPABILITY_CALENDAR_READ)
    );
  }
  if (toolsetId === 'google-docs') {
    return (
      hasServiceAccess(scopes, 'docs') &&
      hasCapability(account.capabilities, GOOGLE_CAPABILITY_DOCS_READ)
    );
  }
  return false;
}

/** Convert a @stitch-connectors/google toolset definition into the server Toolset type. */
function toServerToolset(def: GoogleToolsetDefinition): Toolset {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    instructions: def.instructions,
    tools: () => def.tools(),
    activate: async () => {
      return def.activate(async (account) => {
        const db = getDb();
        const rows = await db
          .select({
            id: connectorInstances.id,
            label: connectorInstances.label,
            accountEmail: connectorInstances.accountEmail,
            accessToken: connectorInstances.accessToken,
            refreshToken: connectorInstances.refreshToken,
            tokenExpiresAt: connectorInstances.tokenExpiresAt,
            oauthProfileId: connectorInstances.oauthProfileId,
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

        if (!accountSupportsToolset(def.id, chosen)) {
          throw new Error(
            `Google account ${chosen.accountEmail ?? chosen.label} does not have the permissions required for ${def.name}. Re-authorize this account with the required scopes.`,
          );
        }

        const client = new GoogleClient({
          getAccessToken: async () => {
            const [latest] = await db
              .select({
                id: connectorInstances.id,
                connectorId: connectorInstances.connectorId,
                accessToken: connectorInstances.accessToken,
                refreshToken: connectorInstances.refreshToken,
                tokenExpiresAt: connectorInstances.tokenExpiresAt,
                oauthProfileId: connectorInstances.oauthProfileId,
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

            const now = Date.now();
            const shouldRefresh =
              Boolean(latest.refreshToken) &&
              (latest.accessToken === null ||
                (latest.tokenExpiresAt !== null &&
                  latest.tokenExpiresAt <= now + REFRESH_BUFFER_MS));

            if (shouldRefresh) {
              const definition = getConnectorDefinition(latest.connectorId);
              if (definition?.authType === 'oauth2') {
                const creds = await resolveOAuthCredentials(latest);
                if (creds && latest.refreshToken) {
                  const config = definition.authConfig as OAuthConfig;
                  const refreshed = await refreshAccessToken(
                    config.tokenUrl,
                    creds.clientId,
                    creds.clientSecret,
                    latest.refreshToken,
                  );

                  await db
                    .update(connectorInstances)
                    .set({
                      accessToken: refreshed.accessToken,
                      refreshToken: refreshed.refreshToken ?? latest.refreshToken,
                      tokenExpiresAt: refreshed.expiresIn ? now + refreshed.expiresIn * 1000 : null,
                      status: 'connected',
                      updatedAt: now,
                    })
                    .where(eq(connectorInstances.id, chosen.id));

                  return refreshed.accessToken;
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
        });

        return {
          client,
          usedAccount: chosen.accountEmail ?? chosen.label,
        };
      }) as Record<string, Tool>;
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
    .select()
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

  const toolsetDefs = buildGoogleToolsets({ scopes, capabilities, appliedVersion });

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
