import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PATHS } from '@/lib/paths.js';

const SKILL_MD_FILENAME = 'SKILL.md';

export function getSkillsDir(): string {
  return PATHS.dirPaths.skills;
}

export function getSkillDir(name: string): string {
  return path.join(getSkillsDir(), name);
}

export function getSkillMdPath(name: string): string {
  return path.join(getSkillDir(name), SKILL_MD_FILENAME);
}

export async function ensureSkillsDir(): Promise<void> {
  const dir = getSkillsDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export function buildSkillMd(input: {
  name: string;
  description: string;
  content: string;
}): string {
  return `---\nname: ${input.name}\ndescription: ${input.description}\n---\n\n${input.content}`;
}

export async function listSkillFiles(skillDir: string): Promise<string[]> {
  if (!existsSync(skillDir)) return [];

  const entries = await readdir(skillDir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const relative = path.relative(skillDir, path.join(entry.parentPath, entry.name));
      return relative;
    })
    .filter((file) => file !== SKILL_MD_FILENAME);
}

export async function writeSkillMdFile(name: string, content: string): Promise<void> {
  const skillDir = getSkillDir(name);
  if (!existsSync(skillDir)) {
    await mkdir(skillDir, { recursive: true });
  }
  await writeFile(getSkillMdPath(name), content, 'utf8');
}

export async function readSkillMdFile(name: string): Promise<string | null> {
  const mdPath = getSkillMdPath(name);
  if (!existsSync(mdPath)) return null;
  return readFile(mdPath, 'utf8');
}
