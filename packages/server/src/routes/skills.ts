import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { createSkillSchema, importSkillSchema, updateSkillSchema } from '@stitch/shared/skills/types';

import {
  createSkill,
  deleteSkill,
  importSkillFromDirectory,
  listSkills,
  searchSkillsDirectory,
  updateSkill,
} from '@/skills/service.js';

const skillNameSchema = z.object({ name: z.string().min(1) });
const searchSkillsSchema = z.object({ q: z.string().default('') });

export const skillsRouter = new Hono();

skillsRouter.get('/', async (c) => {
  const result = await listSkills();
  return c.json(result);
});

skillsRouter.get('/search', zValidator('query', searchSkillsSchema), async (c) => {
  const { q } = c.req.valid('query');
  const result = await searchSkillsDirectory(q);
  return c.json(result);
});

skillsRouter.post('/', zValidator('json', createSkillSchema), async (c) => {
  const result = await createSkill(c.req.valid('json'));
  return c.json(result, 201);
});

skillsRouter.post('/import', zValidator('json', importSkillSchema), async (c) => {
  const result = await importSkillFromDirectory(c.req.valid('json'));
  return c.json(result, 201);
});

skillsRouter.put('/:name', zValidator('param', skillNameSchema), zValidator('json', updateSkillSchema), async (c) => {
  const { name } = c.req.valid('param');
  const result = await updateSkill(name, c.req.valid('json'));
  return c.json(result);
});

skillsRouter.delete('/:name', zValidator('param', skillNameSchema), async (c) => {
  const { name } = c.req.valid('param');
  await deleteSkill(name);
  return c.body(null, 204);
});
