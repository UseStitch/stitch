import { z } from 'zod';

const SKILL_TYPES = ['stitch', 'custom', 'external'] as const;

export type SkillType = (typeof SKILL_TYPES)[number];

export type Skill = {
  name: string;
  type: SkillType;
  enabled: boolean;
  description: string;
  content: string;
  location: string;
  files: string[];
};

export type SkillSearchResult = { name: string; slug: string; source: string; installs: number; isImported: boolean };

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const skillNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(64, 'Name must be 64 characters or fewer')
  .regex(
    SKILL_NAME_PATTERN,
    'Use lowercase letters, numbers, and single hyphens only. Do not start or end with a hyphen.',
  );

const skillDescriptionSchema = z
  .string()
  .trim()
  .min(1, 'Description is required')
  .max(1024, 'Description must be 1024 characters or fewer');

const skillContentSchema = z.string().trim().min(1, 'Markdown instructions are required');

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
