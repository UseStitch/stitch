import { and, eq, lte, or } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

import { getMailDb } from '../db/client.js';
import {
  mailAccounts,
  type MailAccountId,
  type MailAccountRecord,
  type MailProviderId,
  type MailThreadId,
} from '../db/schema.js';
import { createOperations } from '../ops/operations.js';
import { createOutbox } from '../ops/outbox.js';
import { getMailProvider } from '../registry.js';
import { runBackfill } from './backfill.js';
import { runIncremental } from './incremental.js';
import { runReconcile } from './reconcile.js';

import type { MailHttpClient, MailLogger, MailProviderContext, SyncAddress } from '../contracts.js';

export type MailEngineEvent =
  | {
      type: 'sync.progress';
      accountId: MailAccountId;
      phase: 'backfill' | 'reconciling';
      processed: number;
      estimatedTotal: number;
    }
  | { type: 'account.updated'; accountId: MailAccountId }
  | { type: 'threads.changed'; accountId: MailAccountId; threadIds: MailThreadId[] };

type MailEngineDeps = {
  createHttpClient(connectorInstanceId: string): MailHttpClient;
  logger: MailLogger;
  attachmentsDir: string;
  emit(event: MailEngineEvent): void;
};

export type EnrollInput = {
  connectorInstanceId: string;
  provider: string;
  email: string;
  backfillDays?: number;
  syncFrequencySeconds?: number;
};
export type DraftInput = {
  accountId: MailAccountId;
  to: SyncAddress[];
  cc: SyncAddress[];
  bcc: SyncAddress[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  inReplyToMessageId: string | null;
};

export type MailEngine = {
  runDueSyncs(): Promise<void>;
  triggerSync(accountId: MailAccountId, mode: 'full' | 'incremental'): void;
  flushOutbox(): Promise<void>;
  stop(): Promise<void>;
  accounts: {
    enroll(input: EnrollInput): Promise<MailAccountId>;
    update(
      accountId: MailAccountId,
      patch: { enabled?: boolean; syncFrequencySeconds?: number; backfillDays?: number },
    ): Promise<void>;
    remove(accountId: MailAccountId): Promise<void>;
  };
  ops: {
    modifyMessage(
      messageId: string,
      input: { addLabelIds?: string[]; removeLabelIds?: string[]; markRead?: boolean },
    ): Promise<void>;
    trashThread(threadId: string): Promise<void>;
    untrashThread(threadId: string): Promise<void>;
    createDraft(input: DraftInput): Promise<string>;
    updateDraft(draftId: string, input: Partial<DraftInput>): Promise<void>;
    deleteDraft(draftId: string): Promise<void>;
    sendDraft(draftId: string): Promise<void>;
    send(input: DraftInput): Promise<void>;
    hydrateThread(threadId: string): Promise<void>;
    fetchAttachment(attachmentId: string): Promise<string>;
  };
};

type RunningSync = { controller: AbortController; promise: Promise<void> };

const ACCOUNT_CONCURRENCY = 3;
const THREADS_CHANGED_DEBOUNCE_MS = 500;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function readAccount(accountId: MailAccountId): Promise<MailAccountRecord | null> {
  const [account] = await getMailDb().select().from(mailAccounts).where(eq(mailAccounts.id, accountId)).limit(1);
  return account ?? null;
}

export function createMailEngine(deps: MailEngineDeps): MailEngine {
  const running = new Map<MailAccountId, RunningSync>();
  const threadBuffers = new Map<MailAccountId, Set<MailThreadId>>();
  const threadTimers = new Map<MailAccountId, ReturnType<typeof setTimeout>>();

  function emitAccountUpdated(accountId: MailAccountId): void {
    deps.emit({ type: 'account.updated', accountId });
  }

  function emitThreadsChanged(accountId: MailAccountId, threadIds: MailThreadId[]): void {
    if (threadIds.length === 0) return;
    const buffer = threadBuffers.get(accountId) ?? new Set<MailThreadId>();
    for (const threadId of threadIds) buffer.add(threadId);
    threadBuffers.set(accountId, buffer);
    if (threadTimers.has(accountId)) return;
    const timer = setTimeout(() => {
      threadTimers.delete(accountId);
      const ids = [...(threadBuffers.get(accountId) ?? [])];
      threadBuffers.delete(accountId);
      if (ids.length > 0) deps.emit({ type: 'threads.changed', accountId, threadIds: ids });
    }, THREADS_CHANGED_DEBOUNCE_MS);
    threadTimers.set(accountId, timer);
  }

  function createContext(account: MailAccountRecord, controller = new AbortController()): MailProviderContext {
    return {
      account,
      http: deps.createHttpClient(account.connectorInstanceId),
      logger: deps.logger,
      signal: controller.signal,
    };
  }

  const outbox = createOutbox({
    createContext: (account) => createContext(account),
    emitAccountUpdated,
    emitThreadsChanged,
    hydrateSentMessage: async (ctx, provider, providerMessageId) =>
      provider.sync.hydrateMessages(ctx, [providerMessageId]),
  });
  const ops = createOperations({
    outbox,
    attachmentsDir: deps.attachmentsDir,
    createContext: (account) => createContext(account),
    emitThreadsChanged,
  });

  async function runAccount(accountId: MailAccountId, forcedMode?: 'full' | 'incremental'): Promise<void> {
    if (running.has(accountId)) return running.get(accountId)!.promise;
    const controller = new AbortController();
    const promise = (async () => {
      const db = getMailDb();
      let account = await readAccount(accountId);
      if (!account || !account.enabled) return;
      if (forcedMode === 'full') {
        await db
          .update(mailAccounts)
          .set({
            syncPhase: 'backfill',
            syncCursor: null,
            backfillCursor: null,
            lastError: null,
            updatedAt: Date.now(),
          })
          .where(eq(mailAccounts.id, account.id));
        account = (await readAccount(accountId))!;
      }

      const provider = getMailProvider(account.provider).sync;
      const ctx = createContext(account, controller);
      try {
        if (account.syncPhase === 'backfill' || account.syncPhase === 'idle' || forcedMode === 'full') {
          const touched = await runBackfill(ctx, provider, {
            progress: (processed, estimatedTotal) =>
              deps.emit({ type: 'sync.progress', accountId, phase: 'backfill', processed, estimatedTotal }),
          });
          emitThreadsChanged(accountId, touched);
        } else if (account.syncPhase === 'reconciling') {
          deps.emit({ type: 'sync.progress', accountId, phase: 'reconciling', processed: 0, estimatedTotal: 1 });
          const touched = await runReconcile(ctx, provider);
          deps.emit({ type: 'sync.progress', accountId, phase: 'reconciling', processed: 1, estimatedTotal: 1 });
          emitThreadsChanged(accountId, touched);
        } else {
          const result = await runIncremental(ctx, provider);
          emitThreadsChanged(accountId, result.touchedThreadIds);
          if (result.queuedReconcile) void runAccount(accountId, 'incremental');
        }
        emitAccountUpdated(accountId);
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) return;
        deps.logger.error({ error, accountId }, 'Mail sync failed');
        await db
          .update(mailAccounts)
          .set({ syncPhase: 'error', lastError: errorMessage(error), updatedAt: Date.now() })
          .where(eq(mailAccounts.id, account.id));
        emitAccountUpdated(accountId);
      }
    })();
    running.set(accountId, { controller, promise });
    try {
      await promise;
    } finally {
      running.delete(accountId);
    }
  }

  async function runDueSyncs(): Promise<void> {
    const db = getMailDb();
    const now = Date.now();
    const accounts = await db
      .select()
      .from(mailAccounts)
      .where(
        and(
          eq(mailAccounts.enabled, true),
          or(
            eq(mailAccounts.syncPhase, 'idle'),
            eq(mailAccounts.syncPhase, 'backfill'),
            eq(mailAccounts.syncPhase, 'reconciling'),
            eq(mailAccounts.syncPhase, 'error'),
            lte(mailAccounts.lastSyncedAt, now),
          ),
        ),
      );
    const due = accounts.filter(
      (account) =>
        account.syncPhase !== 'incremental' ||
        account.lastSyncedAt === null ||
        now >= account.lastSyncedAt + account.syncFrequencySeconds * 1000,
    );
    for (let index = 0; index < due.length; index += ACCOUNT_CONCURRENCY) {
      await Promise.all(due.slice(index, index + ACCOUNT_CONCURRENCY).map((account) => runAccount(account.id)));
    }
  }

  function triggerSync(accountId: MailAccountId, mode: 'full' | 'incremental'): void {
    void runAccount(accountId, mode);
  }

  return {
    runDueSyncs,
    triggerSync,
    flushOutbox: () => outbox.flushOutbox(),
    async stop(): Promise<void> {
      for (const timer of threadTimers.values()) clearTimeout(timer);
      threadTimers.clear();
      for (const [accountId, ids] of threadBuffers)
        deps.emit({ type: 'threads.changed', accountId, threadIds: [...ids] });
      threadBuffers.clear();
      for (const run of running.values()) run.controller.abort();
      await Promise.all([...running.values()].map((run) => run.promise));
    },
    accounts: {
      async enroll(input): Promise<MailAccountId> {
        const db = getMailDb();
        const [row] = await db
          .insert(mailAccounts)
          .values({
            connectorInstanceId: input.connectorInstanceId,
            provider: input.provider as MailProviderId,
            email: input.email,
            enabled: true,
            syncPhase: 'backfill',
            syncFrequencySeconds: input.syncFrequencySeconds ?? 90,
            backfillDays: input.backfillDays ?? 90,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
          .returning({ id: mailAccounts.id });
        emitAccountUpdated(row.id);
        triggerSync(row.id, 'full');
        return row.id;
      },
      async update(accountId, patch): Promise<void> {
        const db = getMailDb();
        if (patch.enabled === false) running.get(accountId)?.controller.abort();
        await db
          .update(mailAccounts)
          .set({ ...patch, updatedAt: Date.now() })
          .where(eq(mailAccounts.id, accountId));
        emitAccountUpdated(accountId);
      },
      async remove(accountId): Promise<void> {
        running.get(accountId)?.controller.abort();
        await getMailDb().delete(mailAccounts).where(eq(mailAccounts.id, accountId));
        await fs.rm(path.join(deps.attachmentsDir, accountId), { recursive: true, force: true });
        emitAccountUpdated(accountId);
      },
    },
    ops,
  };
}
