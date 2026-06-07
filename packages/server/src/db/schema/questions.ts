import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { PrefixedString } from '@stitch/shared/id';
import type { QuestionInfo, QuestionRequestStatus } from '@stitch/shared/questions/types';

import { sessions } from '@/db/schema/sessions.js';

export const questions = sqliteTable('questions', {
  id: text('id').$type<PrefixedString<'quest'>>().primaryKey(),
  sessionId: text('session_id')
    .$type<PrefixedString<'ses'>>()
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  questions: blob('questions', { mode: 'json' }).$type<QuestionInfo[]>().notNull(),
  answers: blob('answers', { mode: 'json' }).$type<string[][] | null>(),
  status: text('status').$type<QuestionRequestStatus>().notNull().default('pending'),
  toolCallId: text('tool_call_id').notNull(),
  messageId: text('message_id').$type<PrefixedString<'msg'>>().notNull(),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  answeredAt: integer('answered_at', { mode: 'number' }),
});
