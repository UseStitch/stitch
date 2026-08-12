import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { SkillType } from '@stitch/shared/skills/types';

export const skills = sqliteTable('skills', {
  name: text('name').primaryKey(),
  type: text('type').$type<SkillType>().notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
});
