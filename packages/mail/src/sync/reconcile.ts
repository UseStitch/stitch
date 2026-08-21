import { eq } from 'drizzle-orm';

import { getMailDb } from '../db/client.js';
import { mailAccounts, type MailThreadId } from '../db/schema.js';
import { deleteMissingThreadsSince, persistLabels, persistSyncPage, refreshLabelCounts } from './persist.js';

import type { MailProviderContext, MailSyncProvider } from '../contracts.js';

export async function runReconcile(ctx: MailProviderContext, provider: MailSyncProvider): Promise<MailThreadId[]> {
  const db = getMailDb();
  const account = ctx.account;
  const sinceMs = Math.max(0, Date.now() - account.backfillDays * 86_400_000);
  await persistLabels(account.id, await provider.listLabels(ctx));
  const threads = await provider.listThreadsSince(ctx, sinceMs);
  const upserted = await persistSyncPage(account.id, { threads, nextPageCursor: undefined });
  const deleted = await deleteMissingThreadsSince(
    account.id,
    sinceMs,
    threads.map((thread) => thread.providerThreadId),
  );
  await refreshLabelCounts(account.id);
  await db
    .update(mailAccounts)
    .set({ syncPhase: 'incremental', lastSyncedAt: Date.now(), lastError: null, updatedAt: Date.now() })
    .where(eq(mailAccounts.id, account.id));
  return [...new Set([...upserted, ...deleted])];
}
