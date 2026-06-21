import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { validateCronExpression } from '@stitch/scheduler';
import type {
  Automation,
  ListAutomationsResponse,
  AutomationSchedule,
  AutomationScheduleBlob,
  CreateAutomationInput,
  RunAutomationResponse,
  UpdateAutomationInput,
} from '@stitch/shared/automations/types';
import type { Session } from '@stitch/shared/chat/messages';
import { createAutomationId, createMessageId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { createSession, sendMessage } from '@/chat/service.js';
import { getDb } from '@/db/client.js';
import { automations } from '@/db/schema/automations.js';
import { sessions } from '@/db/schema/sessions.js';
import * as Log from '@/lib/log.js';
import { paginatedQuery } from '@/lib/paginated-query.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { validateProviderModel } from '@/llm/resolve-model.js';

const log = Log.create({ service: 'automations' });

type AutomationDbRow = typeof automations.$inferSelect;
type AutomationRow = Automation;
type SyncAutomationSchedule = (automation: AutomationRow) => Promise<void>;

function normalizeText(value: string): string {
  return value.trim();
}

function validateAutomationSchedule(
  schedule: AutomationSchedule | null,
): ServiceResult<AutomationSchedule | null> {
  if (schedule === null) return ok(null);

  const expression = normalizeText(schedule.expression);
  const result = validateCronExpression(expression);
  if (!result.valid) return err(result.error, 400);

  return ok({ type: 'cron', expression });
}

function serializeAutomationSchedule(
  schedule: AutomationSchedule | null,
): AutomationScheduleBlob | null {
  if (schedule === null) return null;

  return {
    version: 1,
    schedule,
  };
}

function deserializeAutomationSchedule(
  blob: AutomationScheduleBlob | null,
): AutomationSchedule | null {
  if (blob === null) return null;
  if (blob.version !== 1) return null;
  return blob.schedule;
}

function toAutomationRow(row: AutomationDbRow): AutomationRow {
  return {
    ...row,
    schedule: deserializeAutomationSchedule(row.schedule),
  };
}

export async function listAutomations(input: {
  page: number;
  pageSize: number;
}): Promise<ServiceResult<ListAutomationsResponse>> {
  const db = getDb();

  const result = await paginatedQuery({
    dataQuery: db.select().from(automations).orderBy(asc(automations.createdAt)),
    countQuery: db.select({ total: sql<number>`count(*)` }).from(automations),
    page: input.page,
    pageSize: input.pageSize,
    transform: toAutomationRow,
  });

  return ok({ automations: result.items, ...result });
}

export async function getAutomation(automationId: string): Promise<ServiceResult<AutomationRow>> {
  const db = getDb();
  const [automation] = await db
    .select()
    .from(automations)
    .where(eq(automations.id, automationId as PrefixedString<'auto'>));

  if (!automation) {
    return err('Automation not found', 404);
  }

  return ok(toAutomationRow(automation));
}

async function createAutomation(
  input: CreateAutomationInput,
): Promise<ServiceResult<AutomationRow>> {
  const providerId = normalizeText(input.providerId);
  const modelId = normalizeText(input.modelId);
  const title = normalizeText(input.title);
  const initialMessage = normalizeText(input.initialMessage);
  const scheduleInput = input.schedule ?? null;

  if (!providerId || !modelId || !title || !initialMessage) {
    return err('providerId, modelId, title, and initialMessage are required', 400);
  }

  const scheduleResult = validateAutomationSchedule(scheduleInput);
  if (scheduleResult.error) {
    return scheduleResult;
  }

  const validation = await validateProviderModel(providerId, modelId);
  if (validation.error) {
    return validation;
  }

  const db = getDb();
  const id = createAutomationId();
  const [created] = await db
    .insert(automations)
    .values({
      id,
      providerId,
      modelId,
      title,
      initialMessage,
      schedule: serializeAutomationSchedule(scheduleResult.data),
    })
    .returning();

  return ok(toAutomationRow(created));
}

export async function createAutomationAndSync(
  input: CreateAutomationInput,
  syncSchedule: SyncAutomationSchedule,
): Promise<ServiceResult<AutomationRow>> {
  const result = await createAutomation(input);
  if (result.error) return result;

  try {
    await syncSchedule(result.data);
    return result;
  } catch (error) {
    await deleteAutomation(result.data.id);
    return err(error instanceof Error ? error.message : 'Failed to schedule automation', 500);
  }
}

async function updateAutomation(
  automationId: string,
  input: UpdateAutomationInput,
): Promise<ServiceResult<AutomationRow>> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(automations)
    .where(eq(automations.id, automationId as PrefixedString<'auto'>));
  if (!existing) {
    return err('Automation not found', 404);
  }

  const providerId =
    input.providerId !== undefined ? normalizeText(input.providerId) : existing.providerId;
  const modelId = input.modelId !== undefined ? normalizeText(input.modelId) : existing.modelId;
  const title = input.title !== undefined ? normalizeText(input.title) : existing.title;
  const initialMessage =
    input.initialMessage !== undefined
      ? normalizeText(input.initialMessage)
      : existing.initialMessage;
  const scheduleInput =
    input.schedule !== undefined
      ? input.schedule
      : deserializeAutomationSchedule(existing.schedule);

  if (!providerId || !modelId || !title || !initialMessage) {
    return err('providerId, modelId, title, and initialMessage are required', 400);
  }

  const scheduleResult = validateAutomationSchedule(scheduleInput);
  if (scheduleResult.error) {
    return scheduleResult;
  }

  const validation = await validateProviderModel(providerId, modelId);
  if (validation.error) {
    return validation;
  }

  const [updated] = await db
    .update(automations)
    .set({
      providerId,
      modelId,
      title,
      initialMessage,
      schedule: serializeAutomationSchedule(scheduleResult.data),
      updatedAt: Date.now(),
    })
    .where(eq(automations.id, automationId as PrefixedString<'auto'>))
    .returning();

  if (!updated) {
    return err('Automation not found', 404);
  }

  return ok(toAutomationRow(updated));
}

export async function updateAutomationAndSync(
  automationId: string,
  input: UpdateAutomationInput,
  syncSchedule: SyncAutomationSchedule,
): Promise<ServiceResult<AutomationRow>> {
  const beforeResult = await getAutomation(automationId);
  if (beforeResult.error) return beforeResult;

  const result = await updateAutomation(automationId, input);
  if (result.error) return result;

  try {
    await syncSchedule(result.data);
    return result;
  } catch (error) {
    const previous = beforeResult.data;
    await getDb()
      .update(automations)
      .set({
        providerId: previous.providerId,
        modelId: previous.modelId,
        title: previous.title,
        initialMessage: previous.initialMessage,
        schedule: serializeAutomationSchedule(previous.schedule),
        updatedAt: previous.updatedAt,
      })
      .where(eq(automations.id, automationId as PrefixedString<'auto'>));

    await syncSchedule(previous).catch((syncError) => {
      log.error(
        {
          event: 'automation.schedule.rollback.failed',
          automationId,
          error: syncError instanceof Error ? syncError.message : String(syncError),
        },
        'failed to restore automation schedule after update rollback',
      );
    });

    return err(error instanceof Error ? error.message : 'Failed to schedule automation', 500);
  }
}

export async function deleteAutomation(automationId: string): Promise<ServiceResult<null>> {
  const db = getDb();
  const typedId = automationId as PrefixedString<'auto'>;

  const deleted = await db.transaction(async (tx) => {
    await tx.update(sessions).set({ automationId: null }).where(eq(sessions.automationId, typedId));

    return tx
      .delete(automations)
      .where(eq(automations.id, typedId))
      .returning({ id: automations.id });
  });

  if (deleted.length === 0) {
    return err('Automation not found', 404);
  }

  return ok(null);
}

export async function listAutomationSessions(
  automationId: string,
): Promise<ServiceResult<Session[]>> {
  const db = getDb();
  const [existing] = await db
    .select({ id: automations.id })
    .from(automations)
    .where(eq(automations.id, automationId as PrefixedString<'auto'>));
  if (!existing) {
    return err('Automation not found', 404);
  }

  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.type, 'automation'),
        eq(sessions.automationId, automationId as PrefixedString<'auto'>),
      ),
    )
    .orderBy(desc(sessions.updatedAt));

  return ok(rows);
}

export async function runAutomation(
  automationId: string,
): Promise<ServiceResult<RunAutomationResponse>> {
  const db = getDb();

  const [automation] = await db
    .select()
    .from(automations)
    .where(eq(automations.id, automationId as PrefixedString<'auto'>));
  if (!automation) {
    return err('Automation not found', 404);
  }

  const validation = await validateProviderModel(automation.providerId, automation.modelId);
  if (validation.error) {
    return validation;
  }

  const title = `${automation.title} #${automation.runCount + 1}`;
  const sessionResult = await createSession({
    title,
    type: 'automation',
    automationId: automation.id,
  });
  if (sessionResult.error) return sessionResult;
  const session = sessionResult.data;

  const assistantMessageId = createMessageId();
  const sendResult = await sendMessage({
    sessionId: session.id,
    content: automation.initialMessage,
    providerId: automation.providerId,
    modelId: automation.modelId,
    assistantMessageId,
  });
  if (sendResult.error) return sendResult;

  const [updatedAutomation] = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(automations)
      .set({
        runCount: sql`${automations.runCount} + 1`,
        updatedAt: Date.now(),
      })
      .where(eq(automations.id, automation.id))
      .returning({ runCount: automations.runCount });

    if (!updated) return [];

    await tx
      .update(sessions)
      .set({ title: `${automation.title} #${updated.runCount}`, updatedAt: Date.now() })
      .where(eq(sessions.id, session.id));

    return [updated];
  });

  if (!updatedAutomation) {
    return err('Automation not found', 404);
  }

  return ok({
    sessionId: session.id,
    assistantMessageId,
    userMessageId: sendResult.data.userMessageId as PrefixedString<'msg'>,
  });
}
