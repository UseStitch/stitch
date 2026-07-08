import { eq } from 'drizzle-orm';

import { getMailDb } from '../db/client.js';
import { mailAccounts, type MailThreadId } from '../db/schema.js';
import type { MailProviderContext, MailSyncProvider } from '../contracts.js';
import { deleteMissingMessagesSince, persistLabels, persistSyncPage, refreshLabelCounts } from './persist.js';

export async function runReconcile(ctx: MailProviderContext, provider: MailSyncProvider): Promise<MailThreadId[]> {
  const db = getMailDb();
  const account = ctx.account;
  const sinceMs = Math.max(0, Date.now() - account.backfillDays * 86_400_000);
  await persistLabels(account.id, await provider.listLabels(ctx), db);
  const messages = await provider.listMessagesSince(ctx, sinceMs);
  const upserted = await persistSyncPage(account.id, { messages, nextPageCursor: undefined }, db);
  const deleted = await deleteMissingMessagesSince(
    account.id,
    sinceMs,
    messages.map((message) => message.providerMessageId),
    db,
  );
  await refreshLabelCounts(account.id, db);
  await db
    .update(mailAccounts)
    .set({ syncPhase: 'incremental', lastSyncedAt: Date.now(), lastError: null, updatedAt: Date.now() })
    .where(eq(mailAccounts.id, account.id));
  return [...new Set([...upserted, ...deleted])];
}
