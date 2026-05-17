import { tool } from 'ai';
import { z } from 'zod';

import { getSkillByName } from '@/skills/service.js';

export const DISPLAY_NAME = 'Skills';

const skillInputSchema = z.object({
  name: z.string().min(1).describe('The exact skill name to load'),
});

export function createRegisteredTool() {
  return tool({
    description:
      'Load task-specific skill instructions by name. Use this when the available skills list says a skill matches the user request.',
    inputSchema: skillInputSchema,
    execute: async ({ name }) => {
      const result = await getSkillByName(name);
      if ('error' in result) return { error: result.error };

      return {
        name: result.data.name,
        description: result.data.description,
        content: result.data.content,
      };
    },
  });
}
