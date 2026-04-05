import { and, asc, desc, eq, sql } from 'drizzle-orm';

import type { Session } from '@stitch/shared/chat/messages';
import { createAutomationId, createMessageId } from '@stitch/shared/id';
import type {
  Automation,
  AutomationSchedule,
  AutomationScheduleBlob,
  CreateAutomationInput,
  RunAutomationResponse,
  UpdateAutomationInput,
} from '@stitch/shared/automations/types';
import type { PrefixedString } from '@stitch/shared/id';

import { createSession, sendMessage } from '@/chat/service.js';
import { getDb } from '@/db/client.js';
import { automations, providerConfig, sessions } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { isAllowedProvider } from '@/provider/models.js';
import * as Models from '@/provider/models.js';

type AutomationDbRow = typeof automations.$inferSelect;
type AutomationRow = Automation;

async function validateProviderModel(providerId: string, modelId: string): Promise<ServiceResult<null>> {
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

function parseCronField(raw: string, min: number, max: number): boolean {
  const parts = raw.split(',');
  if (parts.length === 0) return false;

  for (const part of parts) {
    if (part === '*') continue;

    if (part.startsWith('*/')) {
      const step = Number(part.slice(2));
      if (!Number.isInteger(step) || step <= 0) return false;
      continue;
    }

    if (part.includes('-')) {
      const [startRaw, endRaw] = part.split('-');
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
      if (start < min || end > max || start > end) return false;
      continue;
    }

    const value = Number(part);
    if (!Number.isInteger(value) || value < min || value > max) return false;
  }

  return true;
}

function validateAutomationSchedule(schedule: AutomationSchedule | null): ServiceResult<AutomationSchedule | null> {
  if (schedule === null) return ok(null);

  if (schedule.type === 'interval') {
    if (!Number.isInteger(schedule.everyMinutes) || schedule.everyMinutes < 1) {
      return err('Interval schedule must be at least 1 minute', 400);
    }

    return ok({
      type: 'interval',
      everyMinutes: schedule.everyMinutes,
    });
  }

  const expression = normalizeText(schedule.expression);
  const fields = expression.split(/\s+/);
  if (fields.length !== 5) {
    return err('Cron expression must have 5 fields', 400);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  const valid =
    parseCronField(minute, 0, 59) &&
    parseCronField(hour, 0, 23) &&
    parseCronField(dayOfMonth, 1, 31) &&
    parseCronField(month, 1, 12) &&
    parseCronField(dayOfWeek, 0, 6);

  if (!valid) {
    return err('Invalid cron expression', 400);
  }

  return ok({
    type: 'cron',
    expression,
  });
}

function serializeAutomationSchedule(schedule: AutomationSchedule | null): AutomationScheduleBlob | null {
  if (schedule === null) return null;

  return {
    version: 1,
    schedule,
  };
}

function deserializeAutomationSchedule(blob: AutomationScheduleBlob | null): AutomationSchedule | null {
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

export async function listAutomations(): Promise<AutomationRow[]> {
  const db = getDb();
  const rows = await db.select().from(automations).orderBy(asc(automations.createdAt));
  return rows.map(toAutomationRow);
}

export async function createAutomation(input: CreateAutomationInput): Promise<ServiceResult<AutomationRow>> {
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

  const providerId = input.providerId !== undefined ? normalizeText(input.providerId) : existing.providerId;
  const modelId = input.modelId !== undefined ? normalizeText(input.modelId) : existing.modelId;
  const title = input.title !== undefined ? normalizeText(input.title) : existing.title;
  const initialMessage =
    input.initialMessage !== undefined ? normalizeText(input.initialMessage) : existing.initialMessage;
  const scheduleInput =
    input.schedule !== undefined ? input.schedule : deserializeAutomationSchedule(existing.schedule);

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
  const deleted = await db
    .delete(automations)
    .where(eq(automations.id, automationId as PrefixedString<'auto'>))
    .returning({ id: automations.id });

  if (deleted.length === 0) {
    return err('Automation not found', 404);
  }

  return ok(null);
}

export async function listAutomationSessions(automationId: string): Promise<ServiceResult<Session[]>> {
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

export async function runAutomation(automationId: string): Promise<ServiceResult<RunAutomationResponse>> {
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
