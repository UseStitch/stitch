import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getSessionById } from '@/chat/session-crud.js';
import { unwrapResult } from '@/lib/route-helpers.js';
import { createQuestion, getPendingQuestions, rejectQuestion, replyQuestion } from '@/question/service.js';

const sessionParamSchema = z.object({ id: z.templateLiteral(['ses_', z.string()]) });

const questionParamSchema = z.object({
  sessionId: z.templateLiteral(['ses_', z.string()]),
  questionId: z.templateLiteral(['quest_', z.string()]),
});

const questionOptionSchema = z.object({ label: z.string(), description: z.string() });

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

const replySchema = z.object({ answers: z.array(z.array(z.string())) });

export const questionsRouter = new Hono();

questionsRouter.get('/sessions/:id/questions', zValidator('param', sessionParamSchema), async (c) => {
  const { id: sessionId } = c.req.valid('param');

  const sessionResult = await getSessionById(sessionId);
  if (sessionResult.error) return unwrapResult(c, sessionResult);

  const result = await getPendingQuestions(sessionId);
  return unwrapResult(c, result);
});

questionsRouter.post(
  '/sessions/:id/questions',
  zValidator('param', sessionParamSchema),
  zValidator('json', createQuestionsSchema),
  async (c) => {
    const { id: sessionId } = c.req.valid('param');

    const sessionResult = await getSessionById(sessionId);
    if (sessionResult.error) return unwrapResult(c, sessionResult);

    const body = c.req.valid('json');

    const result = await createQuestion({
      sessionId,
      questions: body.questions,
      toolCallId: body.toolCallId,
      messageId: body.messageId,
    });

    return unwrapResult(c, result, 201);
  },
);

questionsRouter.post(
  '/sessions/:sessionId/questions/:questionId/reply',
  zValidator('param', questionParamSchema),
  zValidator('json', replySchema),
  async (c) => {
    const { questionId } = c.req.valid('param');
    const { answers } = c.req.valid('json');

    const result = await replyQuestion(questionId, answers);
    return unwrapResult(c, result);
  },
);

questionsRouter.post(
  '/sessions/:sessionId/questions/:questionId/reject',
  zValidator('param', questionParamSchema),
  async (c) => {
    const { questionId } = c.req.valid('param');

    const result = await rejectQuestion(questionId);
    return unwrapResult(c, result);
  },
);
