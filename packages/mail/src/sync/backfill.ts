import { eq } from 'drizzle-orm';

import { getMailDb } from '../db/client.js';
import { mailAccounts, type MailThreadId } from '../db/schema.js';
import type { MailProviderContext, MailSyncProvider } from '../contracts.js';
import { persistLabels, persistSyncPage } from './persist.js';

type BackfillEvents = {
  progress(processed: number, estimatedTotal: number): void;
};

export async function runBackfill(ctx: MailProviderContext, provider: MailSyncProvider, events: BackfillEvents): Promise<MailThreadId[]> {
  const db = getMailDb();
  const account = ctx.account;
  const touched: MailThreadId[] = [];
  const snapshot = account.syncCursor ?? (await provider.snapshotCursor(ctx));
  const fullBodiesAfter = Date.now() - account.backfillDays * 86_400_000;
  let cursor = account.backfillCursor ?? undefined;
  let processed = 0;

  await persistLabels(account.id, await provider.listLabels(ctx), db);
  await db
    .update(mailAccounts)
    .set({ syncPhase: 'backfill', syncCursor: snapshot, lastError: null, updatedAt: Date.now() })
    .where(eq(mailAccounts.id, account.id));

  while (!ctx.signal.aborted) {
    const page = await provider.backfillPage(ctx, cursor, fullBodiesAfter);
    touched.push(...(await persistSyncPage(account.id, page, db)));
    processed += page.messages.length;
    cursor = page.nextPageCursor;
    await db
      .update(mailAccounts)
      .set({ backfillCursor: cursor ?? null, updatedAt: Date.now() })
      .where(eq(mailAccounts.id, account.id));
    events.progress(processed, cursor ? processed + 1 : processed);
    if (!cursor) break;
  }

  if (ctx.signal.aborted) throw new DOMException('Mail backfill aborted', 'AbortError');
  await db
    .update(mailAccounts)
    .set({ syncCursor: snapshot, backfillCursor: null, syncPhase: 'incremental', lastSyncedAt: Date.now(), lastError: null, updatedAt: Date.now() })
    .where(eq(mailAccounts.id, account.id));
  return [...new Set(touched)];
}
