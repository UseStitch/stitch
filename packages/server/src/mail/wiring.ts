import fs from 'node:fs';
import path from 'node:path';

import { GoogleClient } from '@stitch-connectors/google/client';

import type { MailHttpClient } from '@stitch/mail/contracts';
import type { MailAccountId } from '@stitch/mail/db/schema';
import { createMailEngine, type MailEngine, type MailEngineEvent } from '@stitch/mail/engine';
import { gmailOpsProvider, gmailSyncProvider } from '@stitch/mail/providers/gmail';
import { registerMailProvider } from '@stitch/mail/registry';
import { PrefixedString } from '@stitch/shared/id';

import { isAppEnabled } from '@/apps/service.js';
import { ensureFreshAccessToken } from '@/connectors/auth/token-vault.js';
import { GoogleAccountNoAccessTokenError } from '@/connectors/errors.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'mail' });

let mailEngine: MailEngine | null = null;
const syncProgressByAccount = new Map<MailAccountId, { processed: number; estimatedTotal: number }>();

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

function createMailHttpClient(connectorInstanceId: PrefixedString<'conn'>): MailHttpClient {
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

export function getMailSyncProgress(
  accountId: MailAccountId,
): { processed: number; estimatedTotal: number } | undefined {
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

async function getGoogleAccessToken(
  connectorInstanceId: PrefixedString<'conn'>,
  forceRefresh: boolean,
): Promise<string> {
  const token = await ensureFreshAccessToken(connectorInstanceId, { forceRefresh });
  if (!token) throw new GoogleAccountNoAccessTokenError('google', connectorInstanceId);
  return token;
}
