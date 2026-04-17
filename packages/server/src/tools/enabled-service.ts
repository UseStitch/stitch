import { and, eq } from 'drizzle-orm';

import type { ToolEnabledScope, ToolEnabledState } from '@stitch/shared/tools/types';

import { getDb, isDbInitialized } from '@/db/client.js';
import { toolEnabled } from '@/db/schema.js';

export async function getToolEnabledStates(): Promise<ToolEnabledState[]> {
  if (!isDbInitialized()) {
    return [];
  }

  const db = getDb();
  return db.select().from(toolEnabled);
}

export async function setToolEnabledState(opts: {
  scope: ToolEnabledScope;
  identifier: string;
  enabled: boolean;
}): Promise<void> {
  if (!isDbInitialized()) {
    return;
  }

  const db = getDb();
  const now = Date.now();

  await db
    .insert(toolEnabled)
    .values({
      scope: opts.scope,
      identifier: opts.identifier,
      enabled: opts.enabled,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [toolEnabled.scope, toolEnabled.identifier],
      set: {
        enabled: opts.enabled,
        updatedAt: now,
      },
    });
}

export async function isToolEnabled(opts: {
  scope: ToolEnabledScope;
  identifier: string;
}): Promise<boolean> {
  if (!isDbInitialized()) {
    return true;
  }

  const db = getDb();
  const [row] = await db
    .select({ enabled: toolEnabled.enabled })
    .from(toolEnabled)
    .where(and(eq(toolEnabled.scope, opts.scope), eq(toolEnabled.identifier, opts.identifier)));

  return row?.enabled ?? true;
}

export async function getDisabledToolIdentifiers(scope: ToolEnabledScope): Promise<Set<string>> {
  if (!isDbInitialized()) {
    return new Set();
  }

  const db = getDb();
  const rows = await db
    .select({ identifier: toolEnabled.identifier })
    .from(toolEnabled)
    .where(and(eq(toolEnabled.scope, scope), eq(toolEnabled.enabled, false)));

  return new Set(rows.map((row) => row.identifier));
}
