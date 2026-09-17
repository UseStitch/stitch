import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { QuestionInfoSchema } from '@stitch/shared/questions/types';

import { getSessionById } from '@/chat/session-crud.js';
import { routeSchemas } from '@/lib/route-schemas.js';
import { createQuestion, getPendingQuestions, rejectQuestion, replyQuestion } from '@/question/service.js';

const sessionParamSchema = z.object({ id: routeSchemas.sessionId });

const questionParamSchema = z.object({ sessionId: routeSchemas.sessionId, questionId: routeSchemas.questionId });

const createQuestionsSchema = z.object({
  questions: z.array(QuestionInfoSchema).min(1),
  toolCallId: z.string().min(1),
  messageId: routeSchemas.messageId,
});

const replySchema = z.object({ answers: z.array(z.array(z.string())) });

export const questionsRouter = new Hono();

questionsRouter.get('/sessions/:id/questions', zValidator('param', sessionParamSchema), async (c) => {
  const { id: sessionId } = c.req.valid('param');

  await getSessionById(sessionId);
  const result = await getPendingQuestions(sessionId);
  return c.json(result);
});

questionsRouter.post(
  '/sessions/:id/questions',
  zValidator('param', sessionParamSchema),
  zValidator('json', createQuestionsSchema),
  async (c) => {
    const { id: sessionId } = c.req.valid('param');

    await getSessionById(sessionId);

    const body = c.req.valid('json');

    const result = await createQuestion({
      sessionId,
      questions: body.questions,
      toolCallId: body.toolCallId,
      messageId: body.messageId,
    });

    return c.json(result, 201);
  },
);

questionsRouter.post(
  '/sessions/:sessionId/questions/:questionId/reply',
  zValidator('param', questionParamSchema),
  zValidator('json', replySchema),
  async (c) => {
    const { questionId } = c.req.valid('param');
    const { answers } = c.req.valid('json');

    await replyQuestion(questionId, answers);
    return c.json({ ok: true });
  },
);

questionsRouter.post(
  '/sessions/:sessionId/questions/:questionId/reject',
  zValidator('param', questionParamSchema),
  async (c) => {
    const { questionId } = c.req.valid('param');

    await rejectQuestion(questionId);
    return c.json({ ok: true });
  },
);
