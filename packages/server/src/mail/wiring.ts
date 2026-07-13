import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';

import { GoogleClient } from '@stitch-connectors/google/client';

import type { MailHttpClient } from '@stitch/mail/contracts';
import type { MailAccountId } from '@stitch/mail/db/schema';
import { createMailEngine, type MailEngine, type MailEngineEvent } from '@stitch/mail/engine';
import { gmailOpsProvider, gmailSyncProvider } from '@stitch/mail/providers/gmail';
import { registerMailProvider } from '@stitch/mail/registry';
import type { OAuthConfig } from '@stitch/shared/connectors/types';

import { isAppEnabled } from '@/apps/service.js';
import { resolveOAuthCredentials } from '@/connectors/auth/oauth-credentials.js';
import { refreshAccessToken, requiresOAuthReauth } from '@/connectors/auth/oauth2.js';
import { withRefreshLock } from '@/connectors/auth/refresh-lock.js';
import { GoogleAccountNoAccessTokenError, GoogleAccountNotAuthorizedError } from '@/connectors/errors.js';
import { getConnectorDefinition } from '@/connectors/registry.js';
import { getDb } from '@/db/client.js';
import { connectorInstances } from '@/db/schema/connectors.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'mail' });
const REFRESH_BUFFER_MS = 60_000;

type ConnectorInstanceId = (typeof connectorInstances.$inferSelect)['id'];

let mailEngine: MailEngine | null = null;
const syncProgressByAccount = new Map<string, { processed: number; estimatedTotal: number }>();

function emitMailEvent(event: MailEngineEvent): void {
  if (event.type === 'sync.progress') {
    syncProgressByAccount.set(event.accountId, { processed: event.processed, estimatedTotal: event.estimatedTotal });
    internalBus.emit('mail.sync.progress', {
      accountId: event.accountId,
      phase: event.phase,
      processed: event.processed,
      estimatedTotal: event.estimatedTotal,
    });
    return;
  }

  if (event.type === 'account.updated') {
    syncProgressByAccount.delete(event.accountId);
    internalBus.emit('mail.account.updated', { accountId: event.accountId });
    return;
  }

  internalBus.emit('mail.threads.changed', { accountId: event.accountId, threadIds: event.threadIds });
}

export function registerMailProviders(): void {
  registerMailProvider({ sync: gmailSyncProvider, ops: gmailOpsProvider });
}

function createMailHttpClient(connectorInstanceId: string): MailHttpClient {
  const client = new GoogleClient({
    getAccessToken: (options) => getGoogleAccessToken(connectorInstanceId, options?.forceRefresh === true),
    logger: log,
    quotaAccountKey: connectorInstanceId,
  });

  return { request: (url, init) => client.requestRaw(url, init) };
}

export function getMailEngine(): MailEngine {
  if (mailEngine) return mailEngine;

  fs.mkdirSync(PATHS.dirPaths.mailAttachments, { recursive: true });
  mailEngine = createMailEngine({
    createHttpClient: createMailHttpClient,
    logger: log,
    attachmentsDir: PATHS.dirPaths.mailAttachments,
    emit: emitMailEvent,
  });
  return mailEngine;
}

export async function stopMailEngine(): Promise<void> {
  if (!mailEngine) return;
  await mailEngine.stop();
  mailEngine = null;
}

export function getMailSyncProgress(accountId: string): { processed: number; estimatedTotal: number } | undefined {
  return syncProgressByAccount.get(accountId);
}

export async function runMailSyncTick(): Promise<void> {
  if (!(await isAppEnabled('mail'))) return;

  const engine = getMailEngine();
  await engine.flushOutbox();
  await engine.runDueSyncs();
}

export async function removeMailAccount(accountId: MailAccountId): Promise<void> {
  await getMailEngine().accounts.remove(accountId);
  const attachmentDir = path.join(PATHS.dirPaths.mailAttachments, accountId);
  await fs.promises.rm(attachmentDir, { recursive: true, force: true });
}

async function getGoogleAccessToken(connectorInstanceId: string, forceRefresh: boolean): Promise<string> {
  const db = getDb();
  const now = Date.now();
  const [latest] = await db
    .select({
      id: connectorInstances.id,
      connectorId: connectorInstances.connectorId,
      accountEmail: connectorInstances.accountEmail,
      accessToken: connectorInstances.accessToken,
      refreshToken: connectorInstances.refreshToken,
      tokenExpiresAt: connectorInstances.tokenExpiresAt,
      connectorRefId: connectorInstances.connectorRefId,
    })
    .from(connectorInstances)
    .where(eq(connectorInstances.id, connectorInstanceId as ConnectorInstanceId));

  if (!latest) throw new GoogleAccountNotAuthorizedError('google', connectorInstanceId);

  const shouldRefresh =
    Boolean(latest.refreshToken) &&
    (forceRefresh ||
      latest.accessToken === null ||
      (latest.tokenExpiresAt !== null && latest.tokenExpiresAt <= now + REFRESH_BUFFER_MS));

  if (shouldRefresh) {
    const definition = getConnectorDefinition(latest.connectorId);
    if (definition?.authType === 'oauth2') {
      const creds = await resolveOAuthCredentials(latest);
      if (creds && latest.refreshToken) {
        const config = definition.authConfig as OAuthConfig;
        const refreshToken = latest.refreshToken;
        try {
          const refreshed = await withRefreshLock(connectorInstanceId, () =>
            refreshAccessToken(config.tokenUrl, creds.clientId, creds.clientSecret, refreshToken),
          );

          await db
            .update(connectorInstances)
            .set({
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken ?? refreshToken,
              tokenExpiresAt: refreshed.expiresIn ? now + refreshed.expiresIn * 1000 : null,
              status: 'connected',
              authIssue: null,
              updatedAt: now,
            })
            .where(eq(connectorInstances.id, connectorInstanceId as ConnectorInstanceId));

          internalBus.emit('connector.token.refreshed', { instanceId: connectorInstanceId });

          return refreshed.accessToken;
        } catch (error) {
          const requiresReauth = requiresOAuthReauth(error);
          log.error(
            {
              event: 'mail.google.token.refresh.failed',
              instanceId: connectorInstanceId,
              accountEmail: latest.accountEmail,
              forceRefresh,
              requiresReauth,
              error: error instanceof Error ? error.message : String(error),
            },
            requiresReauth ? 'Google token refresh failed and requires reauthorization' : 'Google token refresh failed',
          );
          if (requiresReauth) {
            await db
              .update(connectorInstances)
              .set({ status: 'error', authIssue: 'reauthorization_required', updatedAt: Date.now() })
              .where(eq(connectorInstances.id, connectorInstanceId as ConnectorInstanceId));
            internalBus.emit('connector.auth.failed', { instanceId: connectorInstanceId });
          }
          throw error;
        }
      }
    }
  }

  if (!latest.accessToken) throw new GoogleAccountNoAccessTokenError('google', connectorInstanceId);
  return latest.accessToken;
}
