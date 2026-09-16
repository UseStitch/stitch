import { and, eq } from 'drizzle-orm';

import type { ToolEnabledScope, ToolEnabledState } from '@stitch/shared/tools/types';

import { getDb, isDbInitialized } from '@/db/client.js';
import { toolEnabled } from '@/db/schema/permissions.js';
import { getSkillEnabledStates, setSkillEnabled } from '@/skills/service.js';

export async function getToolEnabledStates(): Promise<ToolEnabledState[]> {
  if (!isDbInitialized()) {
    return [];
  }

  const [toolStates, skillStates] = await Promise.all([getDb().select().from(toolEnabled), getSkillEnabledStates()]);
  return [...toolStates, ...skillStates];
}

export async function setToolEnabledState(opts: {
  scope: ToolEnabledScope;
  identifier: string;
  enabled: boolean;
}): Promise<void> {
  if (!isDbInitialized()) {
    return;
  }

  if (opts.scope === 'skill') {
    await setSkillEnabled(opts.identifier, opts.enabled);
    return;
  }

  const db = getDb();
  const now = Date.now();

  await db
    .insert(toolEnabled)
    .values({ scope: opts.scope, identifier: opts.identifier, enabled: opts.enabled, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [toolEnabled.scope, toolEnabled.identifier],
      set: { enabled: opts.enabled, updatedAt: now },
    });
}

export async function isToolEnabled(opts: { scope: ToolEnabledScope; identifier: string }): Promise<boolean> {
  if (!isDbInitialized()) {
    return true;
  }

  if (opts.scope === 'skill') {
    return (await getSkillEnabledStates()).find((state) => state.identifier === opts.identifier)?.enabled ?? true;
  }

  const db = getDb();
  const rows = await db
    .select({ enabled: toolEnabled.enabled })
    .from(toolEnabled)
    .where(and(eq(toolEnabled.scope, opts.scope), eq(toolEnabled.identifier, opts.identifier)));
  const row = rows.at(0);

  return row?.enabled ?? true;
}

export async function getDisabledToolIdentifiers(scope: ToolEnabledScope): Promise<Set<string>> {
  if (!isDbInitialized()) {
    return new Set();
  }

  if (scope === 'skill') {
    return new Set((await getSkillEnabledStates()).filter((state) => !state.enabled).map((state) => state.identifier));
  }

  const db = getDb();
  const rows = await db
    .select({ identifier: toolEnabled.identifier })
    .from(toolEnabled)
    .where(and(eq(toolEnabled.scope, scope), eq(toolEnabled.enabled, false)));

  return new Set(rows.map((row) => row.identifier));
}
