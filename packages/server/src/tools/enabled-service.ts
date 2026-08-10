import { and, eq } from 'drizzle-orm';

import type { ToolEnabledScope, ToolEnabledState } from '@stitch/shared/tools/types';

import { getDb, isDbInitialized } from '@/db/client.js';
import { toolEnabled } from '@/db/schema/permissions.js';
import {
  getDisabledSkillNames,
  getSkillRegistration,
  getSkillRegistrations,
  setSkillEnabled,
} from '@/skills/registry.js';

export async function getToolEnabledStates(): Promise<ToolEnabledState[]> {
  if (!isDbInitialized()) {
    return [];
  }

  const [toolStates, skillRegistrations] = await Promise.all([
    getDb().select().from(toolEnabled),
    getSkillRegistrations(),
  ]);
  const skillStates: ToolEnabledState[] = Array.from(skillRegistrations, ([identifier, registration]) => ({
    scope: 'skill',
    identifier,
    enabled: registration.enabled,
  }));
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
    return (await getSkillRegistration(opts.identifier))?.enabled ?? true;
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

  if (scope === 'skill') return getDisabledSkillNames();

  const db = getDb();
  const rows = await db
    .select({ identifier: toolEnabled.identifier })
    .from(toolEnabled)
    .where(and(eq(toolEnabled.scope, scope), eq(toolEnabled.enabled, false)));

  return new Set(rows.map((row) => row.identifier));
}
