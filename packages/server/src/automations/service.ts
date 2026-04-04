import { asc, eq } from 'drizzle-orm';

import { createAutomationId } from '@stitch/shared/id';
import type { Automation, CreateAutomationInput, UpdateAutomationInput } from '@stitch/shared/automations/types';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { automations, providerConfig } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { isAllowedProvider } from '@/provider/models.js';
import * as Models from '@/provider/models.js';

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

export async function listAutomations(): Promise<AutomationRow[]> {
  const db = getDb();
  return db.select().from(automations).orderBy(asc(automations.createdAt));
}

export async function createAutomation(input: CreateAutomationInput): Promise<ServiceResult<AutomationRow>> {
  const providerId = normalizeText(input.providerId);
  const modelId = normalizeText(input.modelId);
  const title = normalizeText(input.title);
  const initialMessage = normalizeText(input.initialMessage);

  if (!providerId || !modelId || !title || !initialMessage) {
    return err('providerId, modelId, title, and initialMessage are required', 400);
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
    })
    .returning();

  return ok(created);
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

  if (!providerId || !modelId || !title || !initialMessage) {
    return err('providerId, modelId, title, and initialMessage are required', 400);
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
      updatedAt: Date.now(),
    })
    .where(eq(automations.id, automationId as PrefixedString<'auto'>))
    .returning();

  if (!updated) {
    return err('Automation not found', 404);
  }

  return ok(updated);
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
