import { and, eq, inArray, ne, or } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import { createSkillId } from '@stitch/shared/id';
import {
  createSkillSchema,
  importSkillSchema,
  updateSkillSchema,
} from '@stitch/shared/skills/types';
import type {
  Skill,
  SkillCreateInput,
  SkillId,
  SkillImportInput,
  SkillSearchResult,
  SkillUpdateInput,
} from '@stitch/shared/skills/types';

import { getDb, isDbInitialized } from '@/db/client.js';
import { skills } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { getBuiltInSkillSource, loadBuiltInSkills } from '@/skills/built-in-skills.js';
import { parseSkillMarkdown } from '@/skills/parse-skill-markdown.js';

const log = Log.create({ service: 'skills' });

type SkillsSearchApiResponse = {
  skills?: Array<{
    id?: unknown;
    name?: unknown;
    installs?: unknown;
    source?: unknown;
  }>;
};

type SkillsDownloadResponse = {
  files?: Array<{
    path?: unknown;
    contents?: unknown;
  }>;
  hash?: unknown;
};

const SKILLS_API_BASE = 'https://skills.sh';
const FETCH_TIMEOUT_MS = 10_000;

function normalizeSkillValue(value: string): string {
  return value.trim();
}

function computeSkillHash(input: SkillCreateInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        name: normalizeSkillValue(input.name),
        description: normalizeSkillValue(input.description),
        content: normalizeSkillValue(input.content),
      }),
      'utf8',
    )
    .digest('hex');
}

function buildSkillRow(input: SkillCreateInput, now: number, source: string | null): Skill {
  return {
    id: createSkillId(),
    name: input.name,
    description: input.description.trim(),
    content: input.content.trim(),
    hash: computeSkillHash(input),
    isExternal: false,
    source,
    createdAt: now,
    updatedAt: now,
  };
}

function toSourceKey(source: string, slug: string): string {
  return `${source.trim().toLowerCase()}/${slug.trim().toLowerCase()}`;
}

async function skillHashExists(hash: string, exceptId?: SkillId): Promise<boolean> {
  const query = exceptId
    ? getDb()
        .select({ id: skills.id })
        .from(skills)
        .where(and(eq(skills.hash, hash), ne(skills.id, exceptId)))
    : getDb().select({ id: skills.id }).from(skills).where(eq(skills.hash, hash));

  const existing = query.get();
  return !!existing;
}

export async function listSkills(): Promise<ServiceResult<Skill[]>> {
  const rows = await getDb().select().from(skills).orderBy(skills.name);
  return ok(rows);
}

export async function getSkillByName(name: string): Promise<ServiceResult<Skill>> {
  const skill = getDb().select().from(skills).where(eq(skills.name, name)).get();
  if (!skill) return err(`Skill "${name}" not found`, 404);
  return ok(skill);
}

async function skillNameExists(name: string, exceptId?: SkillId): Promise<boolean> {
  const query = exceptId
    ? getDb()
        .select({ id: skills.id })
        .from(skills)
        .where(and(eq(skills.name, name), ne(skills.id, exceptId)))
    : getDb().select({ id: skills.id }).from(skills).where(eq(skills.name, name));

  const existing = query.get();
  return !!existing;
}

export async function createSkill(input: SkillCreateInput): Promise<ServiceResult<Skill>> {
  const parsed = createSkillSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Invalid skill', 400);

  const value = parsed.data;
  if (await skillNameExists(value.name)) {
    return err(`Skill name "${value.name}" already exists`, 409);
  }

  const row = buildSkillRow(value, Date.now(), null);

  if (await skillHashExists(row.hash)) {
    return err('A skill with the same instructions already exists', 409);
  }

  await getDb().insert(skills).values(row);
  return ok(row);
}

export async function syncBuiltInSkills(builtInSkills?: SkillCreateInput[]): Promise<void> {
  const loadedSkills = builtInSkills ?? (await loadBuiltInSkills());
  const parsedSkills = loadedSkills.map((skill) => {
    const parsed = createSkillSchema.safeParse(skill);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Invalid built-in skill');
    }
    return parsed.data;
  });

  const names = new Set<string>();
  for (const skill of parsedSkills) {
    if (names.has(skill.name)) throw new Error(`Duplicate built-in skill name: ${skill.name}`);
    names.add(skill.name);
  }

  for (const skill of parsedSkills) {
    const source = getBuiltInSkillSource(skill.name);
    const existing = getDb().select().from(skills).where(eq(skills.name, skill.name)).get();
    const hash = computeSkillHash(skill);

    if (!existing) {
      await getDb()
        .insert(skills)
        .values(buildSkillRow(skill, Date.now(), source));
      continue;
    }

    if (
      existing.description === skill.description.trim() &&
      existing.content === skill.content.trim() &&
      existing.hash === hash &&
      existing.source === source &&
      existing.isExternal === false
    ) {
      continue;
    }

    await getDb()
      .update(skills)
      .set({
        description: skill.description.trim(),
        content: skill.content.trim(),
        hash,
        isExternal: false,
        source,
        updatedAt: Date.now(),
      })
      .where(eq(skills.id, existing.id));
  }
}

export async function updateSkill(
  id: SkillId,
  input: SkillUpdateInput,
): Promise<ServiceResult<Skill>> {
  const parsed = updateSkillSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Invalid skill', 400);

  const existing = getDb().select({ id: skills.id }).from(skills).where(eq(skills.id, id)).get();
  if (!existing) return err('Skill not found', 404);

  const value = parsed.data;
  if (await skillNameExists(value.name, id)) {
    return err(`Skill name "${value.name}" already exists`, 409);
  }

  const hash = computeSkillHash(value);
  if (await skillHashExists(hash, id)) {
    return err('A skill with the same instructions already exists', 409);
  }

  const updatedAt = Date.now();
  const [updated] = await getDb()
    .update(skills)
    .set({
      name: value.name,
      description: value.description.trim(),
      content: value.content.trim(),
      hash,
      updatedAt,
    })
    .where(eq(skills.id, id))
    .returning();

  if (!updated) return err('Skill not found', 404);
  return ok(updated);
}

export async function deleteSkill(id: SkillId): Promise<ServiceResult<null>> {
  const deleted = await getDb()
    .delete(skills)
    .where(eq(skills.id, id))
    .returning({ id: skills.id });
  if (deleted.length === 0) return err('Skill not found', 404);
  return ok(null);
}

export async function searchSkillsDirectory(
  query: string,
): Promise<ServiceResult<SkillSearchResult[]>> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return ok([]);

  try {
    const url = `${SKILLS_API_BASE}/api/search?q=${encodeURIComponent(trimmedQuery)}&limit=10`;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      log.error({ url, status: response.status, body }, 'skills.sh search request failed');
      return err('Failed to search skills directory', 500);
    }

    const body = (await response.json()) as SkillsSearchApiResponse;
    const results = (body.skills ?? [])
      .flatMap((skill): SkillSearchResult[] => {
        if (
          typeof skill.id !== 'string' ||
          typeof skill.name !== 'string' ||
          typeof skill.source !== 'string'
        ) {
          return [];
        }

        return [
          {
            name: skill.name,
            slug: skill.id,
            source: skill.source,
            installs: typeof skill.installs === 'number' ? skill.installs : 0,
            isImported: false,
          },
        ];
      })
      .sort((a, b) => b.installs - a.installs);

    const sourceKeys = results.map((skill) => toSourceKey(skill.source, skill.slug));
    if (sourceKeys.length === 0) return ok(results);

    const existing = await getDb()
      .select({ source: skills.source })
      .from(skills)
      .where(inArray(skills.source, sourceKeys));
    const importedSources = new Set(
      existing.flatMap((skill) => (skill.source ? [skill.source] : [])),
    );

    return ok(
      results.map((skill) => ({
        ...skill,
        isImported: importedSources.has(toSourceKey(skill.source, skill.slug)),
      })),
    );
  } catch (error) {
    log.error({ error, query: trimmedQuery }, 'skills.sh search threw');
    return err('Failed to search skills directory', 500);
  }
}

export async function importSkillFromDirectory(
  input: SkillImportInput,
): Promise<ServiceResult<Skill>> {
  const parsed = importSkillSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Invalid skill import', 400);

  const { source, slug } = parsed.data;
  if (!source.includes('/')) return err('Skill source must be an owner/repo value', 400);

  const sourceKey = toSourceKey(source, slug);
  const existingSource = getDb().select().from(skills).where(eq(skills.source, sourceKey)).get();
  if (existingSource) return ok(existingSource);

  try {
    const encodedSlug = slug.split('/').map(encodeURIComponent).join('/');
    const url = `${SKILLS_API_BASE}/api/download/${encodedSlug}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      log.error(
        { url, status: response.status, body, source, slug },
        'skills.sh download request failed',
      );
      return err('Failed to download skill', 500);
    }

    const body = (await response.json()) as SkillsDownloadResponse;
    const skillFile = (body.files ?? []).find(
      (file) => typeof file.path === 'string' && file.path.toLowerCase().endsWith('skill.md'),
    );
    if (!skillFile || typeof skillFile.contents !== 'string') {
      log.error(
        {
          source,
          slug,
          fileCount: body.files?.length ?? 0,
          filePaths: (body.files ?? []).map((f) => f.path),
        },
        'downloaded skill missing SKILL.md',
      );
      return err('Downloaded skill did not include a SKILL.md file', 422);
    }

    const skillInput = parseSkillMarkdown(skillFile.contents);
    if (!skillInput) {
      log.error(
        { source, slug, contents: skillFile.contents.slice(0, 500) },
        'SKILL.md frontmatter parse failed',
      );
      return err('Downloaded skill has invalid frontmatter', 422);
    }

    const createParsed = createSkillSchema.safeParse(skillInput);
    if (!createParsed.success) {
      log.error(
        { source, slug, issues: createParsed.error.issues },
        'downloaded skill failed schema validation',
      );
      return err(createParsed.error.issues[0]?.message ?? 'Downloaded skill is invalid', 422);
    }

    const value = createParsed.data;
    if (await skillNameExists(value.name)) {
      return err(`Skill name "${value.name}" already exists`, 409);
    }

    const hash = computeSkillHash(value);
    const existingHash = getDb()
      .select({ id: skills.id })
      .from(skills)
      .where(or(eq(skills.hash, hash), eq(skills.source, sourceKey)))
      .get();
    if (existingHash) return err('A skill with the same instructions already exists', 409);

    const now = Date.now();
    const row = {
      id: createSkillId(),
      name: value.name,
      description: value.description.trim(),
      content: value.content.trim(),
      hash,
      isExternal: true,
      source: sourceKey,
      createdAt: now,
      updatedAt: now,
    } satisfies Skill;

    await getDb().insert(skills).values(row);
    return ok(row);
  } catch (error) {
    log.error({ error, source, slug }, 'skills.sh import threw');
    return err('Failed to import skill', 500);
  }
}

export async function buildSkillsSystemPrompt(): Promise<string> {
  if (!isDbInitialized()) return '';

  const result = await listSkills();
  if ('error' in result || result.data.length === 0) return '';

  const lines = result.data.map((skill) => `- ${skill.name}: ${skill.description}`);
  return `Available skills provide task-specific instructions. Use the \`skill\` tool to load a skill when the user's request matches its description.\n\n${lines.join('\n')}`;
}
