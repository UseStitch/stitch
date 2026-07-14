import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { createSkillSchema } from '@stitch/shared/skills/types';

import { SkillInvalidError, SkillNameCollisionError } from '@/skills/errors.js';
import { collectSkillDirFiles, resolveBuiltInsDir } from '@/skills/filesystem.js';
import { parseSkillMarkdown } from '@/skills/parse-skill-markdown.js';

export type BuiltInSkill = {
  name: string;
  description: string;
  content: string;
  files: Array<{ relativePath: string; content: string }>;
};

const SKILL_MD_FILENAME = 'SKILL.md';

export async function loadBuiltInSkills(builtInsDir?: string): Promise<BuiltInSkill[]> {
  const dir = builtInsDir ?? resolveBuiltInsDir();
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const skillDirs = entries.filter((entry) => entry.isDirectory());

  const skills = await Promise.all(
    skillDirs.map(async (skillDirEntry) => {
      const skillDir = path.join(dir, skillDirEntry.name);
      const skillMdPath = path.join(skillDir, SKILL_MD_FILENAME);

      if (!existsSync(skillMdPath)) {
        throw new SkillInvalidError(`Built-in skill directory "${skillDirEntry.name}" is missing ${SKILL_MD_FILENAME}`);
      }

      const markdown = await readFile(skillMdPath, 'utf8');
      const parsed = parseSkillMarkdown(markdown);
      if (!parsed) {
        throw new SkillInvalidError(`Invalid built-in skill markdown: ${skillDirEntry.name}/${SKILL_MD_FILENAME}`);
      }

      const result = createSkillSchema.safeParse(parsed);
      if (!result.success) {
        throw new SkillInvalidError(
          `Invalid built-in skill ${skillDirEntry.name}: ${result.error.issues[0]?.message ?? 'validation failed'}`,
        );
      }

      const files = await collectSkillDirFiles(skillDir, skillDir);

      return { name: result.data.name, description: result.data.description, content: result.data.content, files };
    }),
  );

  const names = new Set<string>();
  for (const skill of skills) {
    if (names.has(skill.name)) throw new SkillNameCollisionError(skill.name);
    names.add(skill.name);
  }

  return skills;
}
