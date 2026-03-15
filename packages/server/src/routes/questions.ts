import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import type { PrefixedString } from '@openwork/shared';
import type { QuestionInfo } from '@openwork/shared';
import { createQuestionId } from '@openwork/shared';

import { getDb } from '../db/client.js';
import { questions, sessions } from '../db/schema.js';
import { replyQuestion, rejectQuestion, getPendingQuestions } from '../question/service.js';

export const questionsRouter = new Hono();

questionsRouter.get('/sessions/:id/questions', async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const rows = await getPendingQuestions(sessionId);

  return c.json(rows);
});

questionsRouter.post('/sessions/:id/questions', async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const body = (await c.req.json()) as {
    questions: QuestionInfo[];
    toolCallId: string;
    messageId: PrefixedString<'msg'>;
  };

  if (!body.questions || !Array.isArray(body.questions) || body.questions.length === 0) {
    return c.json({ error: 'questions array is required' }, 400);
  }

  if (!body.toolCallId || !body.messageId) {
    return c.json({ error: 'toolCallId and messageId are required' }, 400);
  }

  const id = createQuestionId();
  const now = new Date();

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

questionsRouter.post('/sessions/:sessionId/questions/:questionId/reply', async (c) => {
  const questionId = c.req.param('questionId') as PrefixedString<'quest'>;
  const body = (await c.req.json()) as { answers: string[][] };

  if (!body.answers || !Array.isArray(body.answers)) {
    return c.json({ error: 'answers array is required' }, 400);
  }

  await replyQuestion(questionId, body.answers);

  return c.json({ ok: true });
});

questionsRouter.post('/sessions/:sessionId/questions/:questionId/reject', async (c) => {
  const questionId = c.req.param('questionId') as PrefixedString<'quest'>;

  await rejectQuestion(questionId);

  return c.json({ ok: true });
});
