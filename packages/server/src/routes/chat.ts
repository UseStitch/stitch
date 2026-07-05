import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { generateAutomationDraft } from '@/automations/generation.js';
import {
  abortSessionRun,
  getSessionStats,
  requestCompaction,
  resolveDoomLoop,
  sendMessage,
  splitSession,
} from '@/chat/service.js';
import {
  createSession,
  deleteSession,
  getSessionById,
  listSessionMessages,
  listSessions,
  markSessionRead,
  renameSession,
} from '@/chat/session-crud.js';
import { unwrapResult } from '@/lib/route-helpers.js';
import { routeSchemas } from '@/lib/route-schemas.js';
import { listSessionTodos } from '@/todos/service.js';

const sessionIdParamSchema = z.object({ id: routeSchemas.sessionId });

const splitParamSchema = z.object({ id: routeSchemas.sessionId, msgId: routeSchemas.messageId });

const createSessionSchema = z.object({
  title: z.string().trim().min(1).optional(),
  parentSessionId: z.string().optional(),
});

const listSessionsQuerySchema = z.object({
  type: z.enum(['chat', 'automation']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.coerce.number().int().optional(),
  q: z.string().trim().optional(),
});

const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.coerce.number().int().optional(),
});

const renameSessionSchema = z.object({ title: z.string().trim().min(1) });

const sendMessageSchema = z.object({
  content: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  assistantMessageId: routeSchemas.messageId,
  attachments: z
    .array(z.object({ path: z.string().min(1), mime: z.string().min(1), filename: z.string().min(1) }))
    .optional(),
});

const doomLoopResponseSchema = z.object({ response: z.enum(['continue', 'stop']) });

export const chatRouter = new Hono();

chatRouter.post('/sessions', zValidator('json', createSessionSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await createSession(body);
  return unwrapResult(c, result, 201);
});

chatRouter.get('/sessions', zValidator('query', listSessionsQuerySchema), async (c) => {
  const { type, limit, cursor, q } = c.req.valid('query');
  const sessionType = type === 'automation' ? 'automation' : 'chat';
  const result = await listSessions(sessionType, { limit, cursor, search: q });
  return unwrapResult(c, result);
});

chatRouter.get('/sessions/:id', zValidator('param', sessionIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await getSessionById(id);
  return unwrapResult(c, result);
});

chatRouter.get('/sessions/:id/stats', zValidator('param', sessionIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await getSessionStats(id);
  return unwrapResult(c, result);
});

chatRouter.get('/sessions/:id/todos', zValidator('param', sessionIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await listSessionTodos(id);
  return unwrapResult(c, result);
});

chatRouter.get(
  '/sessions/:id/messages',
  zValidator('param', sessionIdParamSchema),
  zValidator('query', listMessagesQuerySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { limit, cursor } = c.req.valid('query');
    const result = await listSessionMessages(id, limit, cursor);
    return unwrapResult(c, result);
  },
);

chatRouter.delete('/sessions/:id', zValidator('param', sessionIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await deleteSession(id);
  return unwrapResult(c, result, 204);
});

chatRouter.patch(
  '/sessions/:id',
  zValidator('param', sessionIdParamSchema),
  zValidator('json', renameSessionSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { title } = c.req.valid('json');
    const result = await renameSession(id, title);
    return unwrapResult(c, result);
  },
);

chatRouter.patch('/sessions/:id/read', zValidator('param', sessionIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await markSessionRead(id);
  return unwrapResult(c, result, 204);
});

chatRouter.post(
  '/sessions/:id/messages',
  zValidator('param', sessionIdParamSchema),
  zValidator('json', sendMessageSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await sendMessage({
      sessionId: id,
      content: body.content,
      attachments: body.attachments,
      providerId: body.providerId,
      modelId: body.modelId,
      assistantMessageId: body.assistantMessageId,
    });
    return unwrapResult(c, result, 202);
  },
);

chatRouter.post(
  '/sessions/:id/doom-loop-response',
  zValidator('param', sessionIdParamSchema),
  zValidator('json', doomLoopResponseSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { response } = c.req.valid('json');
    const result = resolveDoomLoop(id, response);
    return unwrapResult(c, result);
  },
);

chatRouter.post('/sessions/:id/abort', zValidator('param', sessionIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await abortSessionRun(id);
  return unwrapResult(c, result, 204);
});

chatRouter.post('/sessions/:id/split/:msgId', zValidator('param', splitParamSchema), async (c) => {
  const { id, msgId } = c.req.valid('param');
  const result = await splitSession(id, msgId);
  return unwrapResult(c, result, 201);
});

chatRouter.post('/sessions/:id/compact', zValidator('param', sessionIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await requestCompaction(id);
  return unwrapResult(c, result, 202);
});

chatRouter.post('/sessions/:id/generate-automation', zValidator('param', sessionIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await generateAutomationDraft(id);
  return unwrapResult(c, result, 201);
});
