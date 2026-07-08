import { eq } from 'drizzle-orm';

import { getMailDb } from '../db/client.js';
import { mailAccounts, type MailThreadId } from '../db/schema.js';
import { persistLabels, persistSyncChanges, persistSyncPage } from './persist.js';

import type { MailProviderContext, MailSyncProvider } from '../contracts.js';

type IncrementalRunResult = { touchedThreadIds: MailThreadId[]; queuedReconcile: boolean };

export async function runIncremental(
  ctx: MailProviderContext,
  provider: MailSyncProvider,
): Promise<IncrementalRunResult> {
  const db = getMailDb();
  const account = ctx.account;
  if (!account.syncCursor) {
    await db
      .update(mailAccounts)
      .set({ syncPhase: 'backfill', updatedAt: Date.now() })
      .where(eq(mailAccounts.id, account.id));
    return { touchedThreadIds: [], queuedReconcile: false };
  }

  await persistLabels(account.id, await provider.listLabels(ctx), db);
  const result = await provider.incrementalSync(ctx, account.syncCursor);
  if (result.status === 'ok') {
    const touchedThreadIds = await persistSyncChanges(account.id, result.changes, db);
    await db
      .update(mailAccounts)
      .set({
        syncCursor: result.nextSyncCursor,
        syncPhase: 'incremental',
        lastSyncedAt: Date.now(),
        lastError: null,
        updatedAt: Date.now(),
      })
      .where(eq(mailAccounts.id, account.id));
    return { touchedThreadIds, queuedReconcile: false };
  }

  const snapshot = await provider.snapshotCursor(ctx);
  const sinceMs = Math.max(0, (account.lastSyncedAt ?? 0) - 86_400_000);
  const threads = await provider.listThreadsSince(ctx, sinceMs);
  const touchedThreadIds = await persistSyncPage(account.id, { threads, nextPageCursor: undefined }, db);
  await db
    .update(mailAccounts)
    .set({
      syncCursor: snapshot,
      syncPhase: 'reconciling',
      lastSyncedAt: Date.now(),
      lastError: null,
      updatedAt: Date.now(),
    })
    .where(eq(mailAccounts.id, account.id));
  return { touchedThreadIds, queuedReconcile: true };
}
