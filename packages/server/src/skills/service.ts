import { HTTPException } from 'hono/http-exception';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { createSkillSchema, importSkillSchema, updateSkillSchema } from '@stitch/shared/skills/types';
import type {
  Skill,
  SkillCreateInput,
  SkillImportInput,
  SkillSearchResult,
  SkillUpdateInput,
  SkillType,
} from '@stitch/shared/skills/types';

import { getDisabledAppFields } from '@/apps/service.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import type { BuiltInSkill } from '@/skills/built-in-skills.js';
import {
  SkillImportError,
  SkillInvalidError,
  SkillNameCollisionError,
  SkillNotFoundError,
  SkillReadOnlyError,
} from '@/skills/errors.js';
import {
  buildSkillMd,
  ensureSkillsDir,
  getSkillDir,
  getSkillMdPath,
  getSkillsDir,
  listSkillFiles,
  readSkillMdFile,
  syncCompanionFiles,
  writeSkillMdFile,
} from '@/skills/filesystem.js';
import { parseSkillMarkdown } from '@/skills/parse-skill-markdown.js';
import {
  deleteSkillRegistration,
  getSkillRegistration,
  getSkillRegistrations,
  listRetiredBuiltInSkillNames,
  renameSkillRegistration,
  setSkillType,
} from '@/skills/registry.js';
import { getDisabledToolIdentifiers } from '@/tools/enabled-service.js';

const log = Log.create({ service: 'skills' });

function dropNulls<T>(values: Array<T | null>): T[] {
  return values.filter((value): value is T => value !== null);
}

/** A single skills.sh search hit. Hits that fail validation are dropped rather than failing the response. */
const searchHitSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  installs: z.number().catch(0),
});

const searchResponseSchema = z.object({
  skills: z.array(searchHitSchema.nullable().catch(null)).default([]).transform(dropNulls),
});

/** A single file in a skills.sh download. Files that fail validation are dropped rather than failing the response. */
const downloadFileSchema = z.object({ path: z.string(), contents: z.string() });

const downloadResponseSchema = z.object({
  files: z.array(downloadFileSchema.nullable().catch(null)).default([]).transform(dropNulls),
});

const SKILLS_API_BASE = 'https://skills.sh';
const FETCH_TIMEOUT_MS = 10_000;

async function readSkillFromDisk(name: string, type: SkillType, enabled: boolean): Promise<Skill | null> {
  const markdown = await readSkillMdFile(name);
  if (!markdown) return null;

  const parsed = parseSkillMarkdown(markdown);
  if (!parsed) return null;

  const skillDir = getSkillDir(name);
  const files = await listSkillFiles(skillDir);

  return {
    name: parsed.name,
    type,
    enabled,
    description: parsed.description,
    content: parsed.content,
    location: getSkillMdPath(name),
    files,
  };
}

export async function listSkills(): Promise<Skill[]> {
  await ensureSkillsDir();
  const skillsDir = getSkillsDir();

  if (!existsSync(skillsDir)) return [];

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());

  const registrations = await getSkillRegistrations();
  const skills: Skill[] = [];
  const registeredNames = new Set<string>();
  for (const dir of dirs) {
    const registration = registrations.get(dir.name) ?? { type: 'custom' as const, enabled: true };
    const skill = await readSkillFromDisk(dir.name, registration.type, registration.enabled);
    if (skill) {
      skills.push(skill);
      registeredNames.add(dir.name);
      if (!registrations.has(dir.name)) await setSkillType(dir.name, registration.type);
    }
  }

  for (const name of registrations.keys()) {
    if (!registeredNames.has(name)) await deleteSkillRegistration(name);
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

export async function getSkillByName(name: string): Promise<Skill> {
  await ensureSkillsDir();
  const registration = (await getSkillRegistration(name)) ?? { type: 'custom' as const, enabled: true };
  const skill = await readSkillFromDisk(name, registration.type, registration.enabled);
  if (!skill) throw new HTTPException(404, { message: `Skill "${name}" not found` });
  return skill;
}

export async function createSkill(input: SkillCreateInput): Promise<Skill> {
  const parsed = createSkillSchema.safeParse(input);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues.at(0)?.message ?? 'Invalid skill' });

  const value = parsed.data;
  await ensureSkillsDir();

  const skillDir = getSkillDir(value.name);
  if (existsSync(skillDir)) {
    throw new HTTPException(409, { message: new SkillNameCollisionError(value.name).message });
  }

  await writeSkillMdFile(value.name, buildSkillMd(value));

  const skill = {
    name: value.name,
    type: 'custom' as const,
    enabled: true,
    description: value.description.trim(),
    content: value.content.trim(),
    location: getSkillMdPath(value.name),
    files: [],
  };

  await setSkillType(skill.name, skill.type);

  internalBus.emit('skill.created', { name: skill.name });

  return skill;
}

export async function syncBuiltInSkills(builtInSkills: BuiltInSkill[]): Promise<void> {
  await ensureSkillsDir();

  const builtInNames = builtInSkills.map((skill) => skill.name);
  const retiredNames = await listRetiredBuiltInSkillNames(builtInNames);
  for (const name of retiredNames) {
    await rm(getSkillDir(name), { recursive: true, force: true });
    await deleteSkillRegistration(name);
  }

  for (const skill of builtInSkills) {
    const skillDir = getSkillDir(skill.name);
    await writeSkillMdFile(skill.name, buildSkillMd(skill));
    await syncCompanionFiles(skillDir, skill.files);
    await setSkillType(skill.name, 'stitch');
  }

  await listSkills();
}

export async function updateSkill(name: string, input: SkillUpdateInput): Promise<Skill> {
  const parsed = updateSkillSchema.safeParse(input);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues.at(0)?.message ?? 'Invalid skill' });

  const value = parsed.data;
  await ensureSkillsDir();

  const registration = (await getSkillRegistration(name)) ?? { type: 'custom' as const, enabled: true };
  const { type } = registration;
  if (type === 'stitch') throw new HTTPException(403, { message: new SkillReadOnlyError(name).message });

  const currentDir = getSkillDir(name);
  if (!existsSync(currentDir)) {
    throw new HTTPException(404, { message: new SkillNotFoundError(name).message });
  }

  if (value.name !== name) {
    const newDir = getSkillDir(value.name);
    if (existsSync(newDir)) {
      throw new HTTPException(409, { message: new SkillNameCollisionError(value.name).message });
    }
    await rename(currentDir, newDir);
    await renameSkillRegistration(name, value.name);
  }

  await writeSkillMdFile(value.name, buildSkillMd(value));

  const targetDir = getSkillDir(value.name);
  const files = await listSkillFiles(targetDir);

  const skill = {
    name: value.name,
    type,
    enabled: registration.enabled,
    description: value.description.trim(),
    content: value.content.trim(),
    location: getSkillMdPath(value.name),
    files,
  };

  internalBus.emit('skill.updated', { name: skill.name, previousName: name });

  return skill;
}

export async function deleteSkill(name: string): Promise<void> {
  await ensureSkillsDir();

  if ((await getSkillRegistration(name))?.type === 'stitch') {
    throw new HTTPException(403, { message: new SkillReadOnlyError(name).message });
  }

  const skillDir = getSkillDir(name);
  if (!existsSync(skillDir)) {
    throw new HTTPException(404, { message: new SkillNotFoundError(name).message });
  }

  await rm(skillDir, { recursive: true, force: true });
  await deleteSkillRegistration(name);
  internalBus.emit('skill.deleted', { name });
}

export async function searchSkillsDirectory(query: string): Promise<SkillSearchResult[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return [];

  try {
    const url = `${SKILLS_API_BASE}/api/search?q=${encodeURIComponent(trimmedQuery)}&limit=10`;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      log.error({ url, status: response.status, body }, 'skills.sh search request failed');
      throw new HTTPException(500, { message: 'Failed to search skills directory' });
    }

    const body = searchResponseSchema.safeParse(await response.json());
    if (!body.success) {
      log.error({ url, issues: body.error.issues }, 'skills.sh search response failed schema validation');
      throw new HTTPException(500, { message: 'Failed to search skills directory' });
    }

    return body.data.skills
      .map(
        (hit): SkillSearchResult => ({
          name: hit.name,
          slug: hit.id,
          source: hit.source,
          installs: hit.installs,
          isImported: false,
        }),
      )
      .toSorted((a, b) => b.installs - a.installs);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    log.error({ error, query: trimmedQuery }, 'skills.sh search threw');
    throw new HTTPException(500, { message: 'Failed to search skills directory' });
  }
}

export async function importSkillFromDirectory(input: SkillImportInput): Promise<Skill> {
  const parsed = importSkillSchema.safeParse(input);
  if (!parsed.success)
    throw new HTTPException(400, { message: parsed.error.issues.at(0)?.message ?? 'Invalid skill import' });

  const { source, slug } = parsed.data;
  if (!source.includes('/')) throw new HTTPException(400, { message: 'Skill source must be an owner/repo value' });

  try {
    const encodedSlug = slug.split('/').map(encodeURIComponent).join('/');
    const url = `${SKILLS_API_BASE}/api/download/${encodedSlug}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      log.error({ url, status: response.status, body, source, slug }, 'skills.sh download request failed');
      throw new HTTPException(500, { message: new SkillImportError('Failed to download skill').message });
    }

    const body = downloadResponseSchema.safeParse(await response.json());
    if (!body.success) {
      log.error({ url, source, slug, issues: body.error.issues }, 'skills.sh download response failed validation');
      throw new HTTPException(500, { message: new SkillImportError('Failed to download skill').message });
    }

    const downloadedFiles = body.data.files;

    const skillFile = downloadedFiles.find((file) => file.path.toLowerCase().endsWith('skill.md'));
    if (!skillFile) {
      log.error(
        { source, slug, fileCount: downloadedFiles.length, filePaths: downloadedFiles.map((file) => file.path) },
        'downloaded skill missing SKILL.md',
      );
      throw new HTTPException(422, {
        message: new SkillImportError('Downloaded skill did not include a SKILL.md file').message,
      });
    }

    const skillInput = parseSkillMarkdown(skillFile.contents);
    if (!skillInput) {
      log.error({ source, slug, contents: skillFile.contents.slice(0, 500) }, 'SKILL.md frontmatter parse failed');
      throw new HTTPException(422, {
        message: new SkillInvalidError('Downloaded skill has invalid frontmatter').message,
      });
    }

    const createParsed = createSkillSchema.safeParse(skillInput);
    if (!createParsed.success) {
      log.error({ source, slug, issues: createParsed.error.issues }, 'downloaded skill failed schema validation');
      throw new HTTPException(422, {
        message: new SkillInvalidError(createParsed.error.issues.at(0)?.message ?? 'Downloaded skill is invalid')
          .message,
      });
    }

    const value = createParsed.data;
    await ensureSkillsDir();

    const skillDir = getSkillDir(value.name);
    if (existsSync(skillDir)) {
      throw new HTTPException(409, { message: new SkillNameCollisionError(value.name).message });
    }

    await mkdir(skillDir, { recursive: true });

    for (const file of downloadedFiles) {
      const filePath = path.join(skillDir, file.path);
      const fileDir = path.dirname(filePath);
      if (!existsSync(fileDir)) {
        await mkdir(fileDir, { recursive: true });
      }
      await writeFile(filePath, file.contents, 'utf8');
    }

    const skillFiles = await listSkillFiles(skillDir);

    const skill = {
      name: value.name,
      type: 'external' as const,
      enabled: true,
      description: value.description.trim(),
      content: value.content.trim(),
      location: getSkillMdPath(value.name),
      files: skillFiles,
    };

    await setSkillType(skill.name, skill.type);

    internalBus.emit('skill.created', { name: skill.name });

    return skill;
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    if (error instanceof SkillNameCollisionError) {
      throw new HTTPException(409, { message: error.message });
    }
    log.error({ error, source, slug }, 'skills.sh import threw');
    throw new HTTPException(500, { message: new SkillImportError('Failed to import skill').message });
  }
}

export async function buildSkillsSystemPrompt(): Promise<string> {
  const skills = await listSkills();
  if (skills.length === 0) return '';

  const [disabledAppSkillNames, disabledSkillNames] = await Promise.all([
    getDisabledAppFields('skillNames'),
    getDisabledToolIdentifiers('skill'),
  ]);
  const lines = skills
    .filter((skill) => !disabledAppSkillNames.has(skill.name) && !disabledSkillNames.has(skill.name))
    .map((skill) => `- ${skill.name}: ${skill.description}`);
  if (lines.length === 0) return '';

  return `Available skills provide task-specific instructions. Use the \`skill\` tool to load a skill when the user's request matches its description.\n\n${lines.join('\n')}`;
}
