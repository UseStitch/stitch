import { and, desc, eq, inArray } from 'drizzle-orm';

import type { BackgroundTask, BackgroundTaskStatus } from '@stitch/shared/background-tasks/types';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { backgroundTasks } from '@/db/schema/background-tasks.js';

type BackgroundTaskRow = typeof backgroundTasks.$inferSelect;

export type InsertBackgroundTaskInput = {
  id: PrefixedString<'ses'>;
  parentSessionId: PrefixedString<'ses'>;
  childSessionId: PrefixedString<'ses'>;
  originMessageId: PrefixedString<'msg'>;
  originToolCallId: string;
  title: string;
  providerId: string;
  modelId: string;
  activeToolsetIds: string[];
  startedAt?: number;
};

function toBackgroundTask(row: BackgroundTaskRow): BackgroundTask {
  return {
    id: row.id,
    parentSessionId: row.parentSessionId,
    childSessionId: row.childSessionId,
    originMessageId: row.originMessageId,
    originToolCallId: row.originToolCallId,
    title: row.title,
    status: row.status,
    deliveryStatus: row.deliveryStatus,
    result: row.result,
    error: row.error,
    providerId: row.providerId,
    modelId: row.modelId,
    activeToolsetIds: row.activeToolsetIds,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    deliveredAt: row.deliveredAt,
  };
}

export async function insertBackgroundTask(input: InsertBackgroundTaskInput): Promise<BackgroundTask> {
  const now = input.startedAt ?? Date.now();
  const [row] = await getDb()
    .insert(backgroundTasks)
    .values({ ...input, status: 'running', deliveryStatus: 'pending', startedAt: now, updatedAt: now })
    .returning();
  return toBackgroundTask(row);
}

export async function getBackgroundTask(taskId: PrefixedString<'ses'>): Promise<BackgroundTask | null> {
  const row = (await getDb().select().from(backgroundTasks).where(eq(backgroundTasks.id, taskId))).at(0);
  return row ? toBackgroundTask(row) : null;
}

export async function listBackgroundTasks(parentSessionId: PrefixedString<'ses'>): Promise<BackgroundTask[]> {
  const rows = await getDb()
    .select()
    .from(backgroundTasks)
    .where(eq(backgroundTasks.parentSessionId, parentSessionId))
    .orderBy(desc(backgroundTasks.startedAt));
  return rows.map(toBackgroundTask);
}

export async function listRunningBackgroundTasks(parentSessionId: PrefixedString<'ses'>): Promise<BackgroundTask[]> {
  const rows = await getDb()
    .select()
    .from(backgroundTasks)
    .where(and(eq(backgroundTasks.parentSessionId, parentSessionId), eq(backgroundTasks.status, 'running')));
  return rows.map(toBackgroundTask);
}

async function settleBackgroundTask(
  taskId: PrefixedString<'ses'>,
  status: Exclude<BackgroundTaskStatus, 'running'>,
  values: { result?: string | null; error?: string | null },
): Promise<BackgroundTask | null> {
  const now = Date.now();
  const deliveryStatus = status === 'completed' || status === 'error' ? 'pending' : 'not-applicable';
  const row = (
    await getDb()
      .update(backgroundTasks)
      .set({ ...values, status, deliveryStatus, completedAt: now, updatedAt: now })
      .where(and(eq(backgroundTasks.id, taskId), eq(backgroundTasks.status, 'running')))
      .returning()
  ).at(0);
  return row ? toBackgroundTask(row) : null;
}

export function completeBackgroundTask(taskId: PrefixedString<'ses'>, result: string): Promise<BackgroundTask | null> {
  return settleBackgroundTask(taskId, 'completed', { result, error: null });
}

export function failBackgroundTask(taskId: PrefixedString<'ses'>, error: string): Promise<BackgroundTask | null> {
  return settleBackgroundTask(taskId, 'error', { result: null, error });
}

export function markBackgroundTaskCancelled(taskId: PrefixedString<'ses'>): Promise<BackgroundTask | null> {
  return settleBackgroundTask(taskId, 'cancelled', { result: null, error: null });
}

export function markBackgroundTaskInterrupted(taskId: PrefixedString<'ses'>): Promise<BackgroundTask | null> {
  return settleBackgroundTask(taskId, 'interrupted', { result: null, error: null });
}

export async function claimPendingBackgroundTasks(
  parentSessionId: PrefixedString<'ses'>,
  deliveryMessageId: PrefixedString<'msg'>,
): Promise<BackgroundTask[]> {
  return getDb().transaction(async (tx) => {
    const pending = await tx
      .select({ id: backgroundTasks.id })
      .from(backgroundTasks)
      .where(
        and(
          eq(backgroundTasks.parentSessionId, parentSessionId),
          eq(backgroundTasks.deliveryStatus, 'pending'),
          inArray(backgroundTasks.status, ['completed', 'error']),
        ),
      );
    if (pending.length === 0) return [];

    const rows = await tx
      .update(backgroundTasks)
      .set({ deliveryStatus: 'claimed', deliveryMessageId, updatedAt: Date.now() })
      .where(
        and(
          inArray(
            backgroundTasks.id,
            pending.map((task) => task.id),
          ),
          eq(backgroundTasks.deliveryStatus, 'pending'),
        ),
      )
      .returning();
    return rows.map(toBackgroundTask);
  });
}

export async function markBackgroundTaskClaimsDelivered(deliveryMessageId: PrefixedString<'msg'>): Promise<void> {
  const now = Date.now();
  await getDb()
    .update(backgroundTasks)
    .set({ deliveryStatus: 'delivered', deliveredAt: now, updatedAt: now })
    .where(
      and(eq(backgroundTasks.deliveryMessageId, deliveryMessageId), eq(backgroundTasks.deliveryStatus, 'claimed')),
    );
}

export async function releaseBackgroundTaskClaims(deliveryMessageId: PrefixedString<'msg'>): Promise<void> {
  await getDb()
    .update(backgroundTasks)
    .set({ deliveryStatus: 'pending', deliveryMessageId: null, updatedAt: Date.now() })
    .where(
      and(eq(backgroundTasks.deliveryMessageId, deliveryMessageId), eq(backgroundTasks.deliveryStatus, 'claimed')),
    );
}

export async function interruptStaleBackgroundTasks(): Promise<BackgroundTask[]> {
  const now = Date.now();
  const rows = await getDb()
    .update(backgroundTasks)
    .set({ status: 'interrupted', deliveryStatus: 'not-applicable', completedAt: now, updatedAt: now })
    .where(eq(backgroundTasks.status, 'running'))
    .returning();
  return rows.map(toBackgroundTask);
}
