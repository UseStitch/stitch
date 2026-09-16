import { HTTPException } from 'hono/http-exception';
import { existsSync } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
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
import type { ToolEnabledState } from '@stitch/shared/tools/types';

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
  setSkillEnabled as persistSkillEnabled,
  setSkillType,
} from '@/skills/registry.js';

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
const RENAME_JOURNAL_FILENAME = '.rename.json';

const installedNameSchema = z
  .string()
  .min(1)
  .refine((name) => path.basename(name) === name && name !== '.' && name !== '..' && !name.includes('\0'));

const renameJournalSchema = z.object({
  previousName: installedNameSchema,
  name: installedNameSchema,
  markdown: z.string(),
  directory: z.object({ dev: z.number(), ino: z.number() }),
  registration: z.object({ type: z.enum(['custom', 'external']), enabled: z.boolean() }),
});

type RenameJournal = z.infer<typeof renameJournalSchema>;

function assertInstalledName(name: string): void {
  if (installedNameSchema.safeParse(name).success) return;
  throw new HTTPException(400, { message: new SkillInvalidError(`Unsupported skill name "${name}"`).message });
}

let installedOperationQueue: Promise<unknown> = Promise.resolve();

function installedOperation<Args extends unknown[], Result>(operation: (...args: Args) => Promise<Result>) {
  return (...args: Args): Promise<Result> => {
    const result = installedOperationQueue.then(async () => {
      await ensureSkillsDir();
      await recoverPendingRename();
      return operation(...args);
    });
    installedOperationQueue = result.catch(() => undefined);
    return result;
  };
}

function getRenameJournalPath(): string {
  return path.join(getSkillsDir(), RENAME_JOURNAL_FILENAME);
}

async function writeDurableFile(filePath: string, contents: string): Promise<void> {
  const handle = await open(filePath, 'w');
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(directoryPath: string): Promise<void> {
  const handle = await open(directoryPath, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeRenameJournal(journal: RenameJournal): Promise<void> {
  renameJournalSchema.parse(journal);
  const temporaryPath = `${getRenameJournalPath()}.tmp`;
  await writeDurableFile(temporaryPath, JSON.stringify(journal));
  await rename(temporaryPath, getRenameJournalPath());
  await syncDirectory(getSkillsDir());
}

async function recoverPendingRename(): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(getRenameJournalPath(), 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  const { previousName, name, markdown, registration, directory } = renameJournalSchema.parse(JSON.parse(raw));
  if (previousName === name) throw new Error('Invalid skill rename journal');
  const previousDir = getSkillDir(previousName);
  const targetDir = getSkillDir(name);
  const sourceExists = existsSync(previousDir);
  const currentDirectory = await lstat(sourceExists ? previousDir : targetDir);
  if (
    !currentDirectory.isDirectory() ||
    currentDirectory.dev !== directory.dev ||
    currentDirectory.ino !== directory.ino
  ) {
    throw new Error('Skill rename directory identity changed');
  }

  if (sourceExists) {
    if (existsSync(targetDir)) throw new SkillNameCollisionError(name);
    await rename(previousDir, targetDir);
    await syncDirectory(getSkillsDir());
  } else if (!existsSync(targetDir)) {
    throw new SkillNotFoundError(previousName);
  }

  await writeDurableFile(getSkillMdPath(name), markdown);
  await syncDirectory(getSkillDir(name));
  await renameSkillRegistration(previousName, name, registration);
  await rm(getRenameJournalPath(), { force: true });
  await syncDirectory(getSkillsDir());
  internalBus.emit('skill.updated', { name, previousName });
}

function toSkill(input: Omit<Skill, 'location'>): Skill {
  return {
    ...input,
    description: input.description.trim(),
    content: input.content.trim(),
    location: getSkillMdPath(input.name),
  };
}

async function readSkillFromDisk(name: string, type: SkillType, enabled: boolean): Promise<Skill | null> {
  try {
    const markdown = await readSkillMdFile(name);
    if (!markdown) return null;

    const parsed = parseSkillMarkdown(markdown);
    if (!parsed) return null;

    const files = await listSkillFiles(getSkillDir(name));
    return toSkill({ name, type, enabled, description: parsed.description, content: parsed.content, files });
  } catch (error) {
    log.warn({ name, error }, 'Installed skill is unreadable');
    return null;
  }
}

export const listSkills = installedOperation(readInstalledSkills);

async function readInstalledSkills(): Promise<Skill[]> {
  await ensureSkillsDir();
  const skillsDir = getSkillsDir();

  if (!existsSync(skillsDir)) return [];

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());

  const registrations = await getSkillRegistrations();
  const skills: Skill[] = [];
  const registeredNames = new Set(dirs.map((dir) => dir.name));
  for (const dir of dirs) {
    const registration = registrations.get(dir.name) ?? { type: 'custom' as const, enabled: true };
    const skill = await readSkillFromDisk(dir.name, registration.type, registration.enabled);
    if (skill) {
      skills.push(skill);
      if (!registrations.has(dir.name)) await setSkillType(dir.name, registration.type);
    }
  }

  for (const name of registrations.keys()) {
    if (!registeredNames.has(name)) await deleteSkillRegistration(name);
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

export const getSkillByName = installedOperation(readInstalledSkill);

async function readInstalledSkill(name: string): Promise<Skill> {
  assertInstalledName(name);
  await ensureSkillsDir();
  const registration = (await getSkillRegistration(name)) ?? { type: 'custom' as const, enabled: true };
  const skill = await readSkillFromDisk(name, registration.type, registration.enabled);
  if (!skill) throw new HTTPException(404, { message: `Skill "${name}" not found` });
  return skill;
}

export const createSkill = installedOperation(async (input: SkillCreateInput): Promise<Skill> => {
  const parsed = createSkillSchema.safeParse(input);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues.at(0)?.message ?? 'Invalid skill' });

  const value = parsed.data;
  await ensureSkillsDir();

  const skillDir = getSkillDir(value.name);
  if (existsSync(skillDir)) {
    throw new HTTPException(409, { message: new SkillNameCollisionError(value.name).message });
  }

  await writeSkillMdFile(value.name, buildSkillMd(value));

  const skill = toSkill({
    name: value.name,
    type: 'custom' as const,
    enabled: true,
    description: value.description,
    content: value.content,
    files: [],
  });

  await setSkillType(skill.name, skill.type);

  internalBus.emit('skill.created', { name: skill.name });

  return skill;
});

export const syncBuiltInSkills = installedOperation(async (builtInSkills: BuiltInSkill[]): Promise<void> => {
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

  await readInstalledSkills();
});

export const updateSkill = installedOperation(async (name: string, input: SkillUpdateInput): Promise<Skill> => {
  assertInstalledName(name);
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

  if (value.name === name) {
    await writeSkillMdFile(value.name, buildSkillMd(value));
  } else {
    assertInstalledName(name);
    const newDir = getSkillDir(value.name);
    if (existsSync(newDir)) {
      throw new HTTPException(409, { message: new SkillNameCollisionError(value.name).message });
    }
    if (await getSkillRegistration(value.name)) {
      throw new HTTPException(409, { message: new SkillNameCollisionError(value.name).message });
    }
    const { dev, ino } = await lstat(currentDir);
    await writeRenameJournal({
      directory: { dev, ino },
      previousName: name,
      name: value.name,
      markdown: buildSkillMd(value),
      registration: { type, enabled: registration.enabled },
    });
    await recoverPendingRename();

    const targetDir = getSkillDir(value.name);
    const files = await listSkillFiles(targetDir);

    return toSkill({
      name: value.name,
      type,
      enabled: registration.enabled,
      description: value.description,
      content: value.content,
      files,
    });
  }

  const files = await listSkillFiles(currentDir);
  const skill = toSkill({
    name,
    type,
    enabled: registration.enabled,
    description: value.description,
    content: value.content,
    files,
  });

  internalBus.emit('skill.updated', { name: skill.name, previousName: name });

  return skill;
});

export const deleteSkill = installedOperation(async (name: string): Promise<void> => {
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
});

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

export const importSkillFromDirectory = installedOperation(async (input: SkillImportInput): Promise<Skill> => {
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

    const skill = toSkill({
      name: value.name,
      type: 'external' as const,
      enabled: true,
      description: value.description,
      content: value.content,
      files: skillFiles,
    });

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
});

export const getSkillEnabledStates = installedOperation(async (): Promise<ToolEnabledState[]> => {
  await readInstalledSkills();
  return Array.from(await getSkillRegistrations(), ([identifier, registration]) => ({
    scope: 'skill',
    identifier,
    enabled: registration.enabled,
  }));
});

export const setSkillEnabled = installedOperation(async (name: string, enabled: boolean): Promise<void> => {
  await readInstalledSkills();
  if (!(await getSkillRegistration(name))) {
    throw new HTTPException(404, { message: new SkillNotFoundError(name).message });
  }
  await persistSkillEnabled(name, enabled);
});

function isSkillAvailable(skill: Skill, disabledAppSkillNames: Set<string>): boolean {
  return skill.enabled && !disabledAppSkillNames.has(skill.name);
}

export async function loadSkill(name: string): Promise<Skill> {
  const skill = await getSkillByName(name);
  if (!isSkillAvailable(skill, await getDisabledAppFields('skillNames'))) {
    throw new HTTPException(403, { message: `Skill "${name}" is disabled.` });
  }
  return skill;
}

export async function buildSkillsSystemPrompt(): Promise<string> {
  const skills = await listSkills();
  if (skills.length === 0) return '';

  const disabledAppSkillNames = await getDisabledAppFields('skillNames');
  const lines = skills
    .filter((skill) => isSkillAvailable(skill, disabledAppSkillNames))
    .map((skill) => `- ${skill.name}: ${skill.description}`);
  if (lines.length === 0) return '';

  return `Available skills provide task-specific instructions. Use the \`skill\` tool to load a skill when the user's request matches its description.\n\n${lines.join('\n')}`;
}
