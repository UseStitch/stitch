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
      'Load a specialized skill when the task at hand matches one of the skills listed in the system prompt.\n\nUse this tool to inject the skill\'s instructions and resources into current conversation. The output may contain detailed workflow guidance as well as references to scripts, files, etc in the same directory as the skill.\n\nThe skill name must match one of the skills listed in your system prompt.\n\nLoad a specialized skill that provides domain-specific instructions and workflows.\n\nWhen you recognize that a task matches one of the available skills listed below, use this tool to load the full skill instructions.\n\nThe skill will inject detailed instructions, workflows, and access to bundled resources (scripts, references, templates) into the conversation context.\n\nTool output includes a `<skill_content name="...">` block with the loaded content.',
    inputSchema: skillInputSchema,
    execute: async ({ name }) => {
      const result = await getSkillByName(name);
      if ('error' in result) return { error: result.error };

      const skill = result.data;
      const dir = path.dirname(skill.location);
      const base = pathToFileURL(dir).href;

      const fileList = skill.files
        .map((file) => `<file>${path.resolve(dir, file)}</file>`)
        .join('\n');

      const output = [
        `<skill_content name="${skill.name}">`,
        `# Skill: ${skill.name}`,
        '',
        skill.content.trim(),
        '',
        `Base directory for this skill: ${base}`,
        'Relative paths in this skill (e.g., scripts/, references/, agents/, assets/) are relative to this base directory.',
        'Use the Read tool to access any file listed below when needed.',
        'Files in the agents/ directory are sub-agent definitions — execute them using the Task tool (sub task).',
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
