import { eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';
import { createQuestionId } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { questions, sessions } from '@/db/schema.js';
import { replyQuestion, rejectQuestion, getPendingQuestions } from '@/question/service.js';

const questionOptionSchema = z.object({
  label: z.string(),
  description: z.string(),
});

const questionInfoSchema = z.object({
  question: z.string(),
  header: z.string(),
  options: z.array(questionOptionSchema),
  multiple: z.boolean().optional(),
  custom: z.boolean().optional(),
});

const createQuestionsSchema = z.object({
  questions: z.array(questionInfoSchema).min(1),
  toolCallId: z.string().min(1),
  messageId: z.templateLiteral(['msg_', z.string()]),
});

const replySchema = z.object({
  answers: z.array(z.array(z.string())),
});

export const questionsRouter = new Hono();

questionsRouter.get('/sessions/:id/questions', async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const rows = await getPendingQuestions(sessionId);

  return c.json(rows);
});

questionsRouter.post('/sessions/:id/questions', zValidator('json', createQuestionsSchema), async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const body = c.req.valid('json');

  const id = createQuestionId();
  const now = Date.now();

  await db.insert(questions).values({
    id,
    sessionId,
    questions: body.questions,
    status: 'pending',
    toolCallId: body.toolCallId,
    messageId: body.messageId,
    createdAt: now,
  });

  const [row] = await db.select().from(questions).where(eq(questions.id, id));

  return c.json(row, 201);
});

questionsRouter.post('/sessions/:sessionId/questions/:questionId/reply', zValidator('json', replySchema), async (c) => {
  const questionId = c.req.param('questionId') as PrefixedString<'quest'>;
  const { answers } = c.req.valid('json');

  await replyQuestion(questionId, answers);

  return c.json({ ok: true });
});

questionsRouter.post('/sessions/:sessionId/questions/:questionId/reject', async (c) => {
  const questionId = c.req.param('questionId') as PrefixedString<'quest'>;

  await rejectQuestion(questionId);

  return c.json({ ok: true });
});
