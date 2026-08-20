import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { validateCronExpression } from '@stitch/scheduler';
import type {
  Automation,
  DeleteAutomationInput,
  ListAutomationsResponse,
  AutomationSchedule,
  AutomationScheduleBlob,
  CreateAutomationInput,
  RunAutomationResponse,
  UpdateAutomationInput,
} from '@stitch/shared/automations/types';
import type { Session } from '@stitch/shared/chat/messages';
import { ARCHIVE_REASONS } from '@stitch/shared/chat/messages';
import { createAutomationId, createMessageId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { sendMessage } from '@/chat/service.js';
import { createSession } from '@/chat/session-crud.js';
import { getDb } from '@/db/client.js';
import { automations } from '@/db/schema/automations.js';
import { sessions } from '@/db/schema/sessions.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { paginatedQuery } from '@/lib/paginated-query.js';
import { validateProviderModel } from '@/llm/resolve-model.js';

const log = Log.create({ service: 'automations' });

type AutomationDbRow = typeof automations.$inferSelect;
type SyncAutomationSchedule = (automation: Automation) => Promise<void>;

function normalizeText(value: string): string {
  return value.trim();
}

function validateAutomationSchedule(schedule: AutomationSchedule | null): AutomationSchedule | null {
  if (schedule === null) return null;

  const expression = normalizeText(schedule.expression);
  const result = validateCronExpression(expression);
  if (!result.valid) throw new HTTPException(400, { message: result.error });

  return { type: 'cron', expression };
}

function serializeAutomationSchedule(schedule: AutomationSchedule | null): AutomationScheduleBlob | null {
  if (schedule === null) return null;

  return { version: 1, schedule };
}

function deserializeAutomationSchedule(blob: AutomationScheduleBlob | null): AutomationSchedule | null {
  if (blob === null) return null;
  return blob.schedule;
}

function toAutomationRow(row: AutomationDbRow): Automation {
  return { ...row, schedule: deserializeAutomationSchedule(row.schedule) };
}

export async function listAutomations(input: { page: number; pageSize: number }): Promise<ListAutomationsResponse> {
  const db = getDb();

  const result = await paginatedQuery({
    dataQuery: db.select().from(automations).orderBy(asc(automations.createdAt)),
    count: db.$count(automations),
    page: input.page,
    pageSize: input.pageSize,
  });

  return {
    automations: result.items.map(toAutomationRow),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
  };
}

export async function getAutomation(automationId: string): Promise<Automation> {
  const db = getDb();
  const automation = (
    await db
      .select()
      .from(automations)
      .where(eq(automations.id, automationId as PrefixedString<'auto'>))
  ).at(0);

  if (!automation) {
    throw new HTTPException(404, { message: 'Automation not found' });
  }

  return toAutomationRow(automation);
}

async function createAutomation(input: CreateAutomationInput): Promise<Automation> {
  const providerId = normalizeText(input.providerId);
  const modelId = normalizeText(input.modelId);
  const title = normalizeText(input.title);
  const initialMessage = normalizeText(input.initialMessage);
  const scheduleInput = input.schedule ?? null;

  if (!providerId || !modelId || !title || !initialMessage) {
    throw new HTTPException(400, { message: 'providerId, modelId, title, and initialMessage are required' });
  }

  const schedule = validateAutomationSchedule(scheduleInput);
  await validateProviderModel(providerId, modelId);

  const db = getDb();
  const id = createAutomationId();
  const [created] = await db
    .insert(automations)
    .values({ id, providerId, modelId, title, initialMessage, schedule: serializeAutomationSchedule(schedule) })
    .returning();

  return toAutomationRow(created);
}

export async function createAutomationAndSync(
  input: CreateAutomationInput,
  syncSchedule: SyncAutomationSchedule,
): Promise<Automation> {
  const automation = await createAutomation(input);

  try {
    await syncSchedule(automation);
    return automation;
  } catch (error) {
    await deleteAutomation(automation.id);
    throw new HTTPException(500, { message: Error.isError(error) ? error.message : 'Failed to schedule automation' });
  }
}

async function updateAutomation(automationId: string, input: UpdateAutomationInput): Promise<Automation> {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(automations)
      .where(eq(automations.id, automationId as PrefixedString<'auto'>))
  ).at(0);
  if (!existing) {
    throw new HTTPException(404, { message: 'Automation not found' });
  }

  const providerId = input.providerId !== undefined ? normalizeText(input.providerId) : existing.providerId;
  const modelId = input.modelId !== undefined ? normalizeText(input.modelId) : existing.modelId;
  const title = input.title !== undefined ? normalizeText(input.title) : existing.title;
  const initialMessage =
    input.initialMessage !== undefined ? normalizeText(input.initialMessage) : existing.initialMessage;
  const scheduleInput =
    input.schedule !== undefined ? input.schedule : deserializeAutomationSchedule(existing.schedule);

  if (!providerId || !modelId || !title || !initialMessage) {
    throw new HTTPException(400, { message: 'providerId, modelId, title, and initialMessage are required' });
  }

  const schedule = validateAutomationSchedule(scheduleInput);
  await validateProviderModel(providerId, modelId);

  const updated = (
    await db
      .update(automations)
      .set({
        providerId,
        modelId,
        title,
        initialMessage,
        schedule: serializeAutomationSchedule(schedule),
        updatedAt: Date.now(),
      })
      .where(eq(automations.id, automationId as PrefixedString<'auto'>))
      .returning()
  ).at(0);

  if (!updated) {
    throw new HTTPException(404, { message: 'Automation not found' });
  }

  return toAutomationRow(updated);
}

export async function updateAutomationAndSync(
  automationId: string,
  input: UpdateAutomationInput,
  syncSchedule: SyncAutomationSchedule,
): Promise<Automation> {
  const before = await getAutomation(automationId);
  const updated = await updateAutomation(automationId, input);

  try {
    await syncSchedule(updated);
    return updated;
  } catch (error) {
    await getDb()
      .update(automations)
      .set({
        providerId: before.providerId,
        modelId: before.modelId,
        title: before.title,
        initialMessage: before.initialMessage,
        schedule: serializeAutomationSchedule(before.schedule),
        updatedAt: before.updatedAt,
      })
      .where(eq(automations.id, automationId as PrefixedString<'auto'>));

    await syncSchedule(before).catch((syncError) => {
      log.error(
        {
          event: 'automation.schedule.rollback.failed',
          automationId,
          error: Error.isError(syncError) ? syncError.message : String(syncError),
        },
        'failed to restore automation schedule after update rollback',
      );
    });

    throw new HTTPException(500, { message: Error.isError(error) ? error.message : 'Failed to schedule automation' });
  }
}

export async function deleteAutomation(
  automationId: string,
  input: DeleteAutomationInput = { archiveSessions: false },
): Promise<void> {
  const db = getDb();
  const typedId = automationId as PrefixedString<'auto'>;

  const deleted = await db.transaction(async (tx) => {
    const now = Date.now();
    if (input.archiveSessions) {
      await tx
        .update(sessions)
        .set({ automationId: null, archivedAt: now, archivedReason: ARCHIVE_REASONS.automationDeleted, updatedAt: now })
        .where(eq(sessions.automationId, typedId));
    } else {
      await tx.delete(sessions).where(eq(sessions.automationId, typedId));
    }

    return tx.delete(automations).where(eq(automations.id, typedId)).returning({ id: automations.id });
  });

  if (deleted.length === 0) {
    throw new HTTPException(404, { message: 'Automation not found' });
  }
}

export async function listAutomationSessions(automationId: string): Promise<Session[]> {
  const db = getDb();
  const existing = (
    await db
      .select({ id: automations.id })
      .from(automations)
      .where(eq(automations.id, automationId as PrefixedString<'auto'>))
  ).at(0);
  if (!existing) {
    throw new HTTPException(404, { message: 'Automation not found' });
  }

  return db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.type, 'automation'),
        eq(sessions.automationId, automationId as PrefixedString<'auto'>),
        isNull(sessions.archivedAt),
      ),
    )
    .orderBy(desc(sessions.updatedAt));
}

export async function runAutomation(automationId: string): Promise<RunAutomationResponse> {
  const db = getDb();

  const automation = (
    await db
      .select()
      .from(automations)
      .where(eq(automations.id, automationId as PrefixedString<'auto'>))
  ).at(0);
  if (!automation) {
    throw new HTTPException(404, { message: 'Automation not found' });
  }

  await validateProviderModel(automation.providerId, automation.modelId);

  const title = `${automation.title} #${automation.runCount + 1}`;
  const session = await createSession({ title, type: 'automation', automationId: automation.id });
  internalBus.emit('automation.run.started', { automationId: automation.id, sessionId: session.id });

  const assistantMessageId = createMessageId();
  let userMessageId: PrefixedString<'msg'>;
  try {
    const sendResult = await sendMessage({
      sessionId: session.id,
      content: automation.initialMessage,
      providerId: automation.providerId,
      modelId: automation.modelId,
      assistantMessageId,
    });
    userMessageId = sendResult.userMessageId as PrefixedString<'msg'>;
  } catch (error) {
    const message = Error.isError(error) ? error.message : String(error);
    internalBus.emit('automation.run.failed', { automationId: automation.id, error: message });
    throw error;
  }

  const [updatedAutomation] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(automations)
      .set({ runCount: sql`${automations.runCount} + 1`, updatedAt: Date.now() })
      .where(eq(automations.id, automation.id))
      .returning({ runCount: automations.runCount });
    const updated = rows[0] as { runCount: number } | undefined;

    if (!updated) return [];

    await tx
      .update(sessions)
      .set({ title: `${automation.title} #${updated.runCount}`, updatedAt: Date.now() })
      .where(eq(sessions.id, session.id));

    return [updated];
  });

  if (!updatedAutomation) {
    internalBus.emit('automation.run.failed', { automationId: automation.id, error: 'Automation not found' });
    throw new HTTPException(404, { message: 'Automation not found' });
  }

  internalBus.emit('automation.run.completed', { automationId: automation.id, sessionId: session.id });

  return { sessionId: session.id, assistantMessageId, userMessageId };
}
