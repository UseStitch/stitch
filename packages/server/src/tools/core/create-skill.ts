import { tool } from 'ai';

import { createSkillSchema } from '@stitch/shared/skills/types';

import { createSkill } from '@/skills/service.js';
import type { ToolDefinition } from '@/tools/runtime/pipeline.js';

const createSkillInputSchema = createSkillSchema.describe('A reusable skill to save for future use');

export async function createSkillFromTool(input: unknown) {
  const parsed = createSkillSchema.parse(input);
  const result = await createSkill(parsed);
  if (result.error) {
    return { error: result.error.message };
  }

  return {
    name: result.data.name,
    description: result.data.description,
    location: result.data.location,
    output: `Created skill "${result.data.name}" at ${result.data.location}`,
  };
}

export const definition: ToolDefinition = {
  name: 'create_skill',
  displayName: 'Create Skill',
  tool: tool({
    description: `Create a reusable skill from finalized skill content.

Use this only after the user has confirmed the skill name, description, and instructions. This writes a managed SKILL.md into the user's skills directory. The name must use lowercase letters, numbers, and single hyphens only.`,
    inputSchema: createSkillInputSchema,
    execute: createSkillFromTool,
  }),
};
