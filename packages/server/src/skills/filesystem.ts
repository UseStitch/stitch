import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PATHS } from '@/lib/paths.js';

const SKILL_MD_FILENAME = 'SKILL.md';
const BUNDLED_DIR = 'skills/built-ins';

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

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
      return normalizePath(relative);
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

export async function syncCompanionFiles(
  skillDir: string,
  sourceFiles: Array<{ relativePath: string; content: string }>,
): Promise<boolean> {
  if (!existsSync(skillDir)) {
    await mkdir(skillDir, { recursive: true });
  }

  let changed = false;

  const sourceFileSet = new Set(sourceFiles.map((f) => normalizePath(f.relativePath)));

  for (const file of sourceFiles) {
    const targetPath = path.join(skillDir, file.relativePath);
    const targetDir = path.dirname(targetPath);

    let existingContent: string | null = null;
    if (existsSync(targetPath)) {
      existingContent = await readFile(targetPath, 'utf8');
    }

    if (existingContent === file.content) continue;

    if (!existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true });
    }
    await writeFile(targetPath, file.content, 'utf8');
    changed = true;
  }

  const existingFiles = await listSkillFiles(skillDir);
  for (const existingFile of existingFiles) {
    if (!sourceFileSet.has(existingFile)) {
      const filePath = path.join(skillDir, existingFile);
      await rm(filePath, { force: true });
      changed = true;

      const dir = path.dirname(filePath);
      if (dir !== skillDir) {
        const dirEntries = await readdir(dir);
        if (dirEntries.length === 0) {
          await rm(dir, { recursive: true, force: true });
        }
      }
    }
  }

  return changed;
}

export function resolveBuiltInsDir(): string {
  const sourceDir = fileURLToPath(new URL('./built-ins', import.meta.url));
  if (existsSync(sourceDir)) return sourceDir;

  return path.join(path.dirname(process.execPath), 'server-assets', BUNDLED_DIR);
}

export async function collectSkillDirFiles(
  dir: string,
  baseDir: string,
): Promise<Array<{ relativePath: string; content: string }>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: Array<{ relativePath: string; content: string }> = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectSkillDirFiles(fullPath, baseDir);
      files.push(...nested);
    } else {
      const relativePath = normalizePath(path.relative(baseDir, fullPath));
      if (relativePath === SKILL_MD_FILENAME) continue;
      const content = await readFile(fullPath, 'utf8');
      files.push({ relativePath, content });
    }
  }

  return files;
}
