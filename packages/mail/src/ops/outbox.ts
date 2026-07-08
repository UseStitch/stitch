import { and, asc, eq, lt, lte, or } from 'drizzle-orm';

import { getMailDb } from '../db/client.js';
import {
  mailAccounts,
  mailDrafts,
  mailOutbox,
  type MailAccountId,
  type MailDraftId,
  type MailMessageId,
  type MailAccountRecord,
  type MailOutboxId,
  type MailOutboxOpType,
  type MailThreadId,
} from '../db/schema.js';
import { getMailProvider } from '../registry.js';
import { persistSyncPage } from '../sync/persist.js';

import type { MailProviderContext, MailProviderModule, OutgoingDraft, SyncThread } from '../contracts.js';

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 3_600_000;
const MAX_ATTEMPTS = 8;

export type OutboxPayload =
  | { draft: OutgoingDraft }
  | { draftId: MailDraftId; providerDraftId: string | null; draft: OutgoingDraft }
  | { threadId: MailThreadId; providerThreadId: string }
  | { messageId: MailMessageId; providerMessageId: string; addProviderIds: string[]; removeProviderIds: string[] }
  | { draftId: MailDraftId; providerDraftId: string | null };

type OutboxDeps = {
  createContext(account: MailAccountRecord): MailProviderContext;
  emitAccountUpdated(accountId: MailAccountId): void;
  emitThreadsChanged(accountId: MailAccountId, threadIds: MailThreadId[]): void;
  hydrateSentThread(
    ctx: MailProviderContext,
    provider: MailProviderModule,
    providerThreadId: string,
  ): Promise<SyncThread | null>;
};

export type OutboxController = {
  enqueue(accountId: MailAccountId, opType: MailOutboxOpType, payload: OutboxPayload): Promise<MailOutboxId>;
  flushOutbox(): Promise<void>;
};

function parsePayload(payloadJson: string): OutboxPayload {
  return JSON.parse(payloadJson) as OutboxPayload;
}

function nextAttemptAt(attempts: number): number {
  return Date.now() + Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function markFailed(id: MailOutboxId, attempts: number, error: unknown): Promise<void> {
  const db = getMailDb();
  await db
    .update(mailOutbox)
    .set({
      status: 'failed',
      attempts,
      nextAttemptAt: attempts >= MAX_ATTEMPTS ? Date.now() : nextAttemptAt(attempts),
      lastError: errorMessage(error),
    })
    .where(eq(mailOutbox.id, id));
}

async function processSentMessage(
  deps: OutboxDeps,
  ctx: MailProviderContext,
  provider: MailProviderModule,
  providerThreadId: string,
): Promise<void> {
  const thread = await deps.hydrateSentThread(ctx, provider, providerThreadId);
  if (!thread) return;
  const touched = await persistSyncPage(ctx.account.id, { threads: [thread], nextPageCursor: undefined });
  deps.emitThreadsChanged(ctx.account.id, touched);
}

async function processOutboxRow(deps: OutboxDeps, row: typeof mailOutbox.$inferSelect): Promise<void> {
  const db = getMailDb();
  const [account] = await db.select().from(mailAccounts).where(eq(mailAccounts.id, row.accountId)).limit(1);
  if (!account) return;
  const ctx = deps.createContext(account);
  const provider = getMailProvider(account.provider);
  const payload = parsePayload(row.payloadJson);

  if (row.opType === 'send') {
    const result = await provider.ops.send(ctx, (payload as Extract<OutboxPayload, { draft: OutgoingDraft }>).draft);
    await processSentMessage(deps, ctx, provider, result.providerThreadId);
  }
  if (row.opType === 'send_draft') {
    const draftPayload = payload as Extract<
      OutboxPayload,
      { draftId: MailDraftId; providerDraftId: string | null; draft: OutgoingDraft }
    >;
    const result = draftPayload.providerDraftId
      ? await provider.ops.sendDraft(ctx, draftPayload.providerDraftId)
      : await provider.ops.send(ctx, draftPayload.draft);
    await db.delete(mailDrafts).where(eq(mailDrafts.id, draftPayload.draftId));
    await processSentMessage(deps, ctx, provider, result.providerThreadId);
  }
  if (row.opType === 'trash_thread') {
    await provider.ops.trashThread(
      ctx,
      (payload as Extract<OutboxPayload, { providerThreadId: string }>).providerThreadId,
    );
  }
  if (row.opType === 'untrash_thread') {
    await provider.ops.untrashThread(
      ctx,
      (payload as Extract<OutboxPayload, { providerThreadId: string }>).providerThreadId,
    );
  }
  if (row.opType === 'modify_labels') {
    const labelPayload = payload as Extract<
      OutboxPayload,
      { providerMessageId: string; addProviderIds: string[]; removeProviderIds: string[] }
    >;
    await provider.ops.modifyMessageLabels(
      ctx,
      labelPayload.providerMessageId,
      labelPayload.addProviderIds,
      labelPayload.removeProviderIds,
    );
  }
  if (row.opType === 'create_draft') {
    const draftPayload = payload as Extract<
      OutboxPayload,
      { draftId: MailDraftId; providerDraftId: string | null; draft: OutgoingDraft }
    >;
    const result = await provider.ops.createDraft(ctx, draftPayload.draft);
    await db
      .update(mailDrafts)
      .set({ providerDraftId: result.providerDraftId, dirty: false, updatedAt: Date.now() })
      .where(eq(mailDrafts.id, draftPayload.draftId));
  }
  if (row.opType === 'update_draft') {
    const draftPayload = payload as Extract<
      OutboxPayload,
      { draftId: MailDraftId; providerDraftId: string | null; draft: OutgoingDraft }
    >;
    if (draftPayload.providerDraftId)
      await provider.ops.updateDraft(ctx, draftPayload.providerDraftId, draftPayload.draft);
    await db
      .update(mailDrafts)
      .set({ dirty: false, updatedAt: Date.now() })
      .where(eq(mailDrafts.id, draftPayload.draftId));
  }
  if (row.opType === 'delete_draft') {
    const draftPayload = payload as Extract<OutboxPayload, { draftId: MailDraftId; providerDraftId: string | null }>;
    if (draftPayload.providerDraftId) await provider.ops.deleteDraft(ctx, draftPayload.providerDraftId);
  }
}

export function createOutbox(deps: OutboxDeps): OutboxController {
  let flushPromise: Promise<void> | null = null;

  async function flushOutbox(): Promise<void> {
    if (flushPromise) return flushPromise;
    flushPromise = (async () => {
      const db = getMailDb();
      while (true) {
        const now = Date.now();
        const rows = await db
          .select()
          .from(mailOutbox)
          .where(
            and(
              or(eq(mailOutbox.status, 'pending'), eq(mailOutbox.status, 'failed')),
              lt(mailOutbox.attempts, MAX_ATTEMPTS),
              lte(mailOutbox.nextAttemptAt, now),
            ),
          )
          .orderBy(asc(mailOutbox.createdAt))
          .limit(10);
        if (rows.length === 0) break;

        for (const row of rows) {
          await db.update(mailOutbox).set({ status: 'in_flight', lastError: null }).where(eq(mailOutbox.id, row.id));
          try {
            await processOutboxRow(deps, row);
            await db.update(mailOutbox).set({ status: 'done', lastError: null }).where(eq(mailOutbox.id, row.id));
          } catch (error) {
            const attempts = row.attempts + 1;
            await markFailed(row.id, attempts, error);
            if (attempts >= MAX_ATTEMPTS) deps.emitAccountUpdated(row.accountId);
          }
        }
      }
    })();

    try {
      await flushPromise;
    } finally {
      flushPromise = null;
    }
  }

  async function enqueue(
    accountId: MailAccountId,
    opType: MailOutboxOpType,
    payload: OutboxPayload,
  ): Promise<MailOutboxId> {
    const db = getMailDb();
    const [row] = await db
      .insert(mailOutbox)
      .values({
        accountId,
        opType,
        payloadJson: JSON.stringify(payload),
        status: 'pending',
        attempts: 0,
        nextAttemptAt: Date.now(),
      })
      .returning({ id: mailOutbox.id });
    void flushOutbox();
    return row.id;
  }

  return { enqueue, flushOutbox };
}

export const OUTBOX_RETRY = { baseBackoffMs: BASE_BACKOFF_MS, maxBackoffMs: MAX_BACKOFF_MS, maxAttempts: MAX_ATTEMPTS };
