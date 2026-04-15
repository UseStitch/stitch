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
import { automations, providerConfig, sessions } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { isAllowedProvider } from '@/llm/provider/models.js';
import * as Models from '@/llm/provider/models.js';

type AutomationDbRow = typeof automations.$inferSelect;
type AutomationRow = Automation;

async function validateProviderModel(
  providerId: string,
  modelId: string,
): Promise<ServiceResult<null>> {
  if (!isAllowedProvider(providerId)) {
    return err('Provider not found', 404);
  }

  const providers = await Models.get();
  const provider = providers[providerId];
  if (!provider) {
    return err('Provider not found', 404);
  }

  if (!provider.models[modelId]) {
    return err('Model not found for provider', 400);
  }

  const db = getDb();
  const [configuredProvider] = await db
    .select({ providerId: providerConfig.providerId })
    .from(providerConfig)
    .where(eq(providerConfig.providerId, providerId));
  if (!configuredProvider) {
    return err('Provider is not configured', 400);
  }

  return ok(null);
}

function normalizeText(value: string): string {
  return value.trim();
}

function validateAutomationSchedule(
  schedule: AutomationSchedule | null,
): ServiceResult<AutomationSchedule | null> {
  if (schedule === null) return ok(null);

  const expression = schedule.expression.trim();
  const result = validateCronExpression(expression);
  if (!result.valid) return err(result.error, 400);

  return ok({
    type: 'cron',
    expression,
  });
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
}): Promise<ListAutomationsResponse> {
  const db = getDb();
  const offset = (input.page - 1) * input.pageSize;
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(automations)
      .orderBy(asc(automations.createdAt))
      .limit(input.pageSize)
      .offset(offset),
    db.select({ total: sql<number>`count(*)` }).from(automations),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);

  return {
    automations: rows.map(toAutomationRow),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages,
  };
}

export async function createAutomation(
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
  if ('error' in scheduleResult) {
    return scheduleResult;
  }

  const validation = await validateProviderModel(providerId, modelId);
  if ('error' in validation) {
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

export async function updateAutomation(
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
  if ('error' in scheduleResult) {
    return scheduleResult;
  }

  const validation = await validateProviderModel(providerId, modelId);
  if ('error' in validation) {
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

export async function deleteAutomation(automationId: string): Promise<ServiceResult<null>> {
  const db = getDb();
  const typedId = automationId as PrefixedString<'auto'>;

  await db.update(sessions).set({ automationId: null }).where(eq(sessions.automationId, typedId));

  const deleted = await db
    .delete(automations)
    .where(eq(automations.id, typedId))
    .returning({ id: automations.id });

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
  if ('error' in validation) {
    return validation;
  }

  const [updatedAutomation] = await db
    .update(automations)
    .set({
      runCount: sql`${automations.runCount} + 1`,
      updatedAt: Date.now(),
    })
    .where(eq(automations.id, automation.id))
    .returning({ runCount: automations.runCount });

  if (!updatedAutomation) {
    return err('Automation not found', 404);
  }

  const title = `${automation.title} #${updatedAutomation.runCount}`;
  const session = await createSession({
    title,
    type: 'automation',
    automationId: automation.id,
  });

  const assistantMessageId = createMessageId();
  const sendResult = await sendMessage({
    sessionId: session.id,
    content: automation.initialMessage,
    providerId: automation.providerId,
    modelId: automation.modelId,
    assistantMessageId,
  });
  if ('error' in sendResult) {
    return sendResult;
  }

  return ok({
    sessionId: session.id,
    assistantMessageId,
    userMessageId: sendResult.data.userMessageId as PrefixedString<'msg'>,
  });
}
