import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const lanceMigrations = sqliteTable('lance_migrations', {
  version: integer('version').primaryKey(),
  id: text('id').notNull().default(''),
  prevId: text('prev_id'),
  name: text('name').notNull(),
  checksum: text('checksum').notNull().default(''),
  status: text('status', { enum: ['applied', 'failed'] })
    .notNull()
    .default('applied'),
  error: text('error'),
  appliedAt: integer('applied_at', { mode: 'number' }).notNull(),
});
