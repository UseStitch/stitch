import { tool } from 'ai';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

import { getSkillByName } from '@/skills/service.js';

export const DISPLAY_NAME = 'Skills';

const skillInputSchema = z.object({
  name: z.string().min(1).describe('The name of the skill from available_skills'),
});

export function createRegisteredTool() {
  return tool({
    description:
      "Load a specialized skill when the task at hand matches one of the skills listed in the system prompt.\n\nUse this tool to inject the skill's instructions and resources into current conversation. The output may contain detailed workflow guidance as well as references to scripts, files, etc in the same directory as the skill.\n\nThe skill name must match one of the skills listed in your system prompt.",
    inputSchema: skillInputSchema,
    execute: async ({ name }) => {
      const result = await getSkillByName(name);
      if ('error' in result) return { error: result.error };

      const skill = result.data;
      const dir = path.dirname(skill.location);
      const base = pathToFileURL(dir).href;

      const fileList = skill.files
        .slice(0, 10)
        .map((file) => `<file>${path.resolve(dir, file)}</file>`)
        .join('\n');

      const output = [
        `<skill_content name="${skill.name}">`,
        `# Skill: ${skill.name}`,
        '',
        skill.content.trim(),
        '',
        `Base directory for this skill: ${base}`,
        'Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.',
        'Note: file list is sampled.',
        '',
        '<skill_files>',
        fileList,
        '</skill_files>',
        '</skill_content>',
      ].join('\n');

      return {
        name: skill.name,
        description: skill.description,
        content: output,
      };
    },
  });
}
