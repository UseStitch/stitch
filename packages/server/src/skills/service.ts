import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createSkillSchema,
  importSkillSchema,
  updateSkillSchema,
} from '@stitch/shared/skills/types';
import type {
  Skill,
  SkillCreateInput,
  SkillImportInput,
  SkillSearchResult,
  SkillUpdateInput,
} from '@stitch/shared/skills/types';

import * as Log from '@/lib/log.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import type { BuiltInSkill } from '@/skills/built-in-skills.js';
import {
  SkillImportError,
  SkillInvalidError,
  SkillNameCollisionError,
  SkillNotFoundError,
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

async function readSkillFromDisk(name: string): Promise<Skill | null> {
  const markdown = await readSkillMdFile(name);
  if (!markdown) return null;

  const parsed = parseSkillMarkdown(markdown);
  if (!parsed) return null;

  const skillDir = getSkillDir(name);
  const files = await listSkillFiles(skillDir);

  return {
    name: parsed.name,
    description: parsed.description,
    content: parsed.content,
    location: getSkillMdPath(name),
    files,
  };
}

export async function listSkills(): Promise<ServiceResult<Skill[]>> {
  await ensureSkillsDir();
  const skillsDir = getSkillsDir();

  if (!existsSync(skillsDir)) return ok([]);

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());

  const skills: Skill[] = [];
  for (const dir of dirs) {
    const skill = await readSkillFromDisk(dir.name);
    if (skill) skills.push(skill);
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return ok(skills);
}

export async function getSkillByName(name: string): Promise<ServiceResult<Skill>> {
  await ensureSkillsDir();
  const skill = await readSkillFromDisk(name);
  if (!skill) return err(`Skill "${name}" not found`, 404);
  return ok(skill);
}

export async function createSkill(input: SkillCreateInput): Promise<ServiceResult<Skill>> {
  const parsed = createSkillSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Invalid skill', 400);

  const value = parsed.data;
  await ensureSkillsDir();

  const skillDir = getSkillDir(value.name);
  if (existsSync(skillDir)) {
    return err(new SkillNameCollisionError(value.name).message, 409);
  }

  await writeSkillMdFile(value.name, buildSkillMd(value));

  return ok({
    name: value.name,
    description: value.description.trim(),
    content: value.content.trim(),
    location: getSkillMdPath(value.name),
    files: [],
  });
}

export async function syncBuiltInSkills(builtInSkills: BuiltInSkill[]): Promise<void> {
  await ensureSkillsDir();

  for (const skill of builtInSkills) {
    const skillDir = getSkillDir(skill.name);

    if (existsSync(skillDir)) continue;

    await writeSkillMdFile(skill.name, buildSkillMd(skill));
    await syncCompanionFiles(skillDir, skill.files);
  }
}

export async function updateSkill(
  name: string,
  input: SkillUpdateInput,
): Promise<ServiceResult<Skill>> {
  const parsed = updateSkillSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Invalid skill', 400);

  const value = parsed.data;
  await ensureSkillsDir();

  const currentDir = getSkillDir(name);
  if (!existsSync(currentDir)) {
    return err(new SkillNotFoundError(name).message, 404);
  }

  if (value.name !== name) {
    const newDir = getSkillDir(value.name);
    if (existsSync(newDir)) {
      return err(new SkillNameCollisionError(value.name).message, 409);
    }
    await rename(currentDir, newDir);
  }

  await writeSkillMdFile(value.name, buildSkillMd(value));

  const targetDir = getSkillDir(value.name);
  const files = await listSkillFiles(targetDir);

  return ok({
    name: value.name,
    description: value.description.trim(),
    content: value.content.trim(),
    location: getSkillMdPath(value.name),
    files,
  });
}

export async function deleteSkill(name: string): Promise<ServiceResult<null>> {
  await ensureSkillsDir();

  const skillDir = getSkillDir(name);
  if (!existsSync(skillDir)) {
    return err(new SkillNotFoundError(name).message, 404);
  }

  await rm(skillDir, { recursive: true, force: true });
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

    return ok(results);
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
      return err(new SkillImportError('Failed to download skill').message, 500);
    }

    const body = (await response.json()) as SkillsDownloadResponse;
    const downloadedFiles = body.files ?? [];

    const skillFile = downloadedFiles.find(
      (file) => typeof file.path === 'string' && file.path.toLowerCase().endsWith('skill.md'),
    );
    if (!skillFile || typeof skillFile.contents !== 'string') {
      log.error(
        {
          source,
          slug,
          fileCount: downloadedFiles.length,
          filePaths: downloadedFiles.map((f) => f.path),
        },
        'downloaded skill missing SKILL.md',
      );
      return err(
        new SkillImportError('Downloaded skill did not include a SKILL.md file').message,
        422,
      );
    }

    const skillInput = parseSkillMarkdown(skillFile.contents);
    if (!skillInput) {
      log.error(
        { source, slug, contents: skillFile.contents.slice(0, 500) },
        'SKILL.md frontmatter parse failed',
      );
      return err(new SkillInvalidError('Downloaded skill has invalid frontmatter').message, 422);
    }

    const createParsed = createSkillSchema.safeParse(skillInput);
    if (!createParsed.success) {
      log.error(
        { source, slug, issues: createParsed.error.issues },
        'downloaded skill failed schema validation',
      );
      return err(
        new SkillInvalidError(
          createParsed.error.issues[0]?.message ?? 'Downloaded skill is invalid',
        ).message,
        422,
      );
    }

    const value = createParsed.data;
    await ensureSkillsDir();

    const skillDir = getSkillDir(value.name);
    if (existsSync(skillDir)) {
      return err(new SkillNameCollisionError(value.name).message, 409);
    }

    await mkdir(skillDir, { recursive: true });

    for (const file of downloadedFiles) {
      if (typeof file.path !== 'string' || typeof file.contents !== 'string') continue;

      const filePath = path.join(skillDir, file.path);
      const fileDir = path.dirname(filePath);
      if (!existsSync(fileDir)) {
        await mkdir(fileDir, { recursive: true });
      }
      await writeFile(filePath, file.contents, 'utf8');
    }

    const skillFiles = await listSkillFiles(skillDir);

    return ok({
      name: value.name,
      description: value.description.trim(),
      content: value.content.trim(),
      location: getSkillMdPath(value.name),
      files: skillFiles,
    });
  } catch (error) {
    if (error instanceof SkillNameCollisionError) {
      return err(error.message, 409);
    }
    log.error({ error, source, slug }, 'skills.sh import threw');
    return err(new SkillImportError('Failed to import skill').message, 500);
  }
}

export async function buildSkillsSystemPrompt(): Promise<string> {
  const result = await listSkills();
  if ('error' in result || result.data.length === 0) return '';

  const lines = result.data.map((skill) => `- ${skill.name}: ${skill.description}`);
  return `Available skills provide task-specific instructions. Use the \`skill\` tool to load a skill when the user's request matches its description.\n\n${lines.join('\n')}`;
}
