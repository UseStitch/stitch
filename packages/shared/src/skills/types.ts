import { z } from 'zod';

export type Skill = {
  name: string;
  description: string;
  content: string;
  location: string;
  files: string[];
};

export type SkillSearchResult = {
  name: string;
  slug: string;
  source: string;
  installs: number;
  isImported: boolean;
};

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const skillNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    SKILL_NAME_PATTERN,
    'Use lowercase letters, numbers, and single hyphens only. Do not start or end with a hyphen.',
  );

const skillDescriptionSchema = z.string().trim().min(1).max(1024);

const skillContentSchema = z.string().trim().min(1);

export const createSkillSchema = z.object({
  name: skillNameSchema,
  description: skillDescriptionSchema,
  content: skillContentSchema,
});

export const updateSkillSchema = createSkillSchema.extend({});

export const importSkillSchema = z.object({
  source: z.string().trim().min(1),
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
});

export type SkillCreateInput = z.infer<typeof createSkillSchema>;
export type SkillUpdateInput = z.infer<typeof updateSkillSchema>;
export type SkillImportInput = z.infer<typeof importSkillSchema>;
