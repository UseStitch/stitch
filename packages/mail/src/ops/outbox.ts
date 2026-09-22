import { and, asc, eq, lt, lte, or } from 'drizzle-orm';
import { z } from 'zod';

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

type OutboxPayloads = {
  send: { draft: OutgoingDraft };
  send_draft: { draftId: MailDraftId; providerDraftId: string | null; draft: OutgoingDraft };
  trash_thread: { threadId: MailThreadId; providerThreadId: string };
  untrash_thread: { threadId: MailThreadId; providerThreadId: string };
  modify_labels: {
    messageId: MailMessageId;
    providerMessageId: string;
    addProviderIds: string[];
    removeProviderIds: string[];
  };
  create_draft: { draftId: MailDraftId; providerDraftId: string | null; draft: OutgoingDraft };
  update_draft: { draftId: MailDraftId; providerDraftId: string | null; draft: OutgoingDraft };
  delete_draft: { draftId: MailDraftId; providerDraftId: string | null };
};

type OutboxPayload = { [Type in MailOutboxOpType]: { opType: Type } & OutboxPayloads[Type] }[MailOutboxOpType];

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
  enqueue<Type extends MailOutboxOpType>(
    accountId: MailAccountId,
    opType: Type,
    payload: OutboxPayloads[Type],
  ): Promise<MailOutboxId>;
  flushOutbox(): Promise<void>;
};

function parsePayload(opType: MailOutboxOpType, payloadJson: string): OutboxPayload {
  return outboxPayloadSchema.parse({ opType, ...JSON.parse(payloadJson) });
}

function nextAttemptAt(attempts: number): number {
  return Date.now() + Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

function errorMessage(error: Error | string): string {
  return Error.isError(error) ? error.message : String(error);
}

async function markFailed(id: MailOutboxId, attempts: number, error: Error | string): Promise<void> {
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
  const account = (await db.select().from(mailAccounts).where(eq(mailAccounts.id, row.accountId)).limit(1)).at(0);
  if (!account) return;
  const ctx = deps.createContext(account);
  const provider = getMailProvider(account.provider);
  const payload = parsePayload(row.opType, row.payloadJson);

  switch (payload.opType) {
    case 'send': {
      const result = await provider.ops.send(ctx, payload.draft);
      await processSentMessage(deps, ctx, provider, result.providerThreadId);
      break;
    }
    case 'send_draft': {
      const result = payload.providerDraftId
        ? await provider.ops.sendDraft(ctx, payload.providerDraftId)
        : await provider.ops.send(ctx, payload.draft);
      await db.delete(mailDrafts).where(eq(mailDrafts.id, payload.draftId));
      await processSentMessage(deps, ctx, provider, result.providerThreadId);
      break;
    }
    case 'trash_thread':
      await provider.ops.trashThread(ctx, payload.providerThreadId);
      break;
    case 'untrash_thread':
      await provider.ops.untrashThread(ctx, payload.providerThreadId);
      break;
    case 'modify_labels':
      await provider.ops.modifyMessageLabels(
        ctx,
        payload.providerMessageId,
        payload.addProviderIds,
        payload.removeProviderIds,
      );
      break;
    case 'create_draft': {
      const result = await provider.ops.createDraft(ctx, payload.draft);
      await db
        .update(mailDrafts)
        .set({ providerDraftId: result.providerDraftId, dirty: false, updatedAt: Date.now() })
        .where(eq(mailDrafts.id, payload.draftId));
      break;
    }
    case 'update_draft':
      if (payload.providerDraftId) await provider.ops.updateDraft(ctx, payload.providerDraftId, payload.draft);
      await db
        .update(mailDrafts)
        .set({ dirty: false, updatedAt: Date.now() })
        .where(eq(mailDrafts.id, payload.draftId));
      break;
    case 'delete_draft':
      if (payload.providerDraftId) await provider.ops.deleteDraft(ctx, payload.providerDraftId);
  }
}

export function createOutbox(deps: OutboxDeps): OutboxController {
  let flushPromise: Promise<void> | null = null;

  async function flushOutbox(): Promise<void> {
    if (flushPromise) return flushPromise;
    flushPromise = (async () => {
      const db = getMailDb();
      for (;;) {
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
            await markFailed(row.id, attempts, Error.isError(error) ? error : String(error));
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

  async function enqueue<Type extends MailOutboxOpType>(
    accountId: MailAccountId,
    opType: Type,
    payload: OutboxPayloads[Type],
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

const mailDraftIdSchema: z.ZodType<MailDraftId> = z.templateLiteral([z.literal('mdrf'), z.string()]);
const mailThreadIdSchema: z.ZodType<MailThreadId> = z.templateLiteral([z.literal('mthr'), z.string()]);
const mailMessageIdSchema: z.ZodType<MailMessageId> = z.templateLiteral([z.literal('mmsg'), z.string()]);
const addressSchema = z.object({ name: z.string().nullable(), email: z.string() });
const outgoingDraftSchema: z.ZodType<OutgoingDraft> = z.object({
  to: z.array(addressSchema),
  cc: z.array(addressSchema),
  bcc: z.array(addressSchema),
  subject: z.string(),
  bodyText: z.string(),
  bodyHtml: z.string().nullable(),
  inReplyTo: z.object({ providerMessageId: z.string(), providerThreadId: z.string() }).nullable(),
});
const draftPayloadSchema = z.object({
  draftId: mailDraftIdSchema,
  providerDraftId: z.string().nullable(),
  draft: outgoingDraftSchema,
});
const threadPayloadSchema = z.object({ threadId: mailThreadIdSchema, providerThreadId: z.string() });
const outboxPayloadSchema: z.ZodType<OutboxPayload> = z.discriminatedUnion('opType', [
  z.object({ opType: z.literal('send'), draft: outgoingDraftSchema }),
  z.object({ opType: z.literal('send_draft') }).extend(draftPayloadSchema.shape),
  z.object({ opType: z.literal('trash_thread') }).extend(threadPayloadSchema.shape),
  z.object({ opType: z.literal('untrash_thread') }).extend(threadPayloadSchema.shape),
  z.object({
    opType: z.literal('modify_labels'),
    messageId: mailMessageIdSchema,
    providerMessageId: z.string(),
    addProviderIds: z.array(z.string()),
    removeProviderIds: z.array(z.string()),
  }),
  z.object({ opType: z.literal('create_draft') }).extend(draftPayloadSchema.shape),
  z.object({ opType: z.literal('update_draft') }).extend(draftPayloadSchema.shape),
  z.object({ opType: z.literal('delete_draft'), draftId: mailDraftIdSchema, providerDraftId: z.string().nullable() }),
]);
