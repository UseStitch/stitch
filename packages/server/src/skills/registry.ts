import { and, eq, notInArray } from 'drizzle-orm';

import type { SkillType } from '@stitch/shared/skills/types';

import { getDb, isDbInitialized } from '@/db/client.js';
import { skills } from '@/db/schema/skills.js';

export type SkillRegistration = { type: SkillType; enabled: boolean };

export async function getSkillRegistrations(): Promise<Map<string, SkillRegistration>> {
  if (!isDbInitialized()) return new Map();

  const rows = await getDb().select().from(skills);
  return new Map(rows.map((row) => [row.name, { type: row.type, enabled: row.enabled }]));
}

export async function getSkillRegistration(name: string): Promise<SkillRegistration | null> {
  if (!isDbInitialized()) return null;

  const rows = await getDb()
    .select({ type: skills.type, enabled: skills.enabled })
    .from(skills)
    .where(eq(skills.name, name));
  return rows.at(0) ?? null;
}

export async function setSkillType(name: string, type: SkillType): Promise<void> {
  if (!isDbInitialized()) return;

  await getDb().insert(skills).values({ name, type }).onConflictDoUpdate({ target: skills.name, set: { type } });
}

export async function setSkillEnabled(name: string, enabled: boolean): Promise<void> {
  if (!isDbInitialized()) return;

  await getDb().update(skills).set({ enabled }).where(eq(skills.name, name));
}

export async function getDisabledSkillNames(): Promise<Set<string>> {
  if (!isDbInitialized()) return new Set();

  const rows = await getDb().select({ name: skills.name }).from(skills).where(eq(skills.enabled, false));
  return new Set(rows.map((row) => row.name));
}

export async function renameSkillRegistration(previousName: string, name: string): Promise<void> {
  if (!isDbInitialized()) return;

  await getDb().update(skills).set({ name }).where(eq(skills.name, previousName));
}

export async function deleteSkillRegistration(name: string): Promise<void> {
  if (!isDbInitialized()) return;

  await getDb().delete(skills).where(eq(skills.name, name));
}

export async function listRetiredBuiltInSkillNames(currentNames: string[]): Promise<string[]> {
  if (!isDbInitialized()) return [];

  const rows = await getDb()
    .select({ name: skills.name })
    .from(skills)
    .where(and(eq(skills.type, 'stitch'), currentNames.length > 0 ? notInArray(skills.name, currentNames) : undefined));
  return rows.map((row) => row.name);
}
