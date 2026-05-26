import { readFile } from 'node:fs/promises';

import { createSkillSchema } from '@stitch/shared/skills/types';
import type { SkillCreateInput } from '@stitch/shared/skills/types';

import { resolveRuntimeAssetPath } from '@/lib/runtime-assets.js';
import { BUILT_IN_SKILL_FILES } from '@/skills/built-ins/manifest.js';
import type { BuiltInSkillFile } from '@/skills/built-ins/manifest.js';
import { parseSkillMarkdown } from '@/skills/parse-skill-markdown.js';

export function getBuiltInSkillSource(name: string): string {
  return `builtin:${name}`;
}

export async function loadBuiltInSkills(
  files: BuiltInSkillFile[] = BUILT_IN_SKILL_FILES,
): Promise<SkillCreateInput[]> {
  const skills = await Promise.all(
    files.map(async (file) => {
      const path = resolveRuntimeAssetPath(file.sourceUrl, file.bundledPath);
      const markdown = await readFile(path, 'utf8');
      const parsed = parseSkillMarkdown(markdown);
      if (!parsed) throw new Error(`Invalid built-in skill markdown: ${file.bundledPath}`);

      const result = createSkillSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(
          `Invalid built-in skill ${file.bundledPath}: ${result.error.issues[0]?.message ?? 'validation failed'}`,
        );
      }

      return result.data;
    }),
  );

  const names = new Set<string>();
  for (const skill of skills) {
    if (names.has(skill.name)) throw new Error(`Duplicate built-in skill name: ${skill.name}`);
    names.add(skill.name);
  }

  return skills;
}
