import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { unwrapResult } from '@/lib/route-helpers.js';
import { routeSchemas } from '@/lib/route-schemas.js';
import {
  addToQueue,
  listQueuedMessages,
  removeFromQueue,
  updateQueuedMessage,
} from '@/queue/service.js';

const attachmentSchema = z.object({
  path: z.string(),
  mime: z.string(),
  filename: z.string(),
});

const addToQueueSchema = z
  .object({
    content: z.string().default(''),
    attachments: z.array(attachmentSchema).optional(),
  })
  .refine(
    (data) => data.content.trim().length > 0 || (data.attachments && data.attachments.length > 0),
    { message: 'content or attachments are required' },
  );

const updateQueuedMessageSchema = z.object({
  content: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const sessionParamSchema = z.object({ id: routeSchemas.sessionId });
const queueParamSchema = z.object({
  id: routeSchemas.sessionId,
  queueId: routeSchemas.queuedMessageId,
});

export const queueRouter = new Hono();

queueRouter.get('/sessions/:id/queue', zValidator('param', sessionParamSchema), (c) => {
  const { id: sessionId } = c.req.valid('param');
  const result = listQueuedMessages(sessionId);
  return unwrapResult(c, result);
});

queueRouter.post(
  '/sessions/:id/queue',
  zValidator('param', sessionParamSchema),
  zValidator('json', addToQueueSchema),
  (c) => {
    const { id: sessionId } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = addToQueue({
      sessionId,
      content: body.content,
      attachments: body.attachments,
    });
    return unwrapResult(c, result, 201);
  },
);

queueRouter.patch(
  '/sessions/:id/queue/:queueId',
  zValidator('param', queueParamSchema),
  zValidator('json', updateQueuedMessageSchema),
  (c) => {
    const { queueId } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = updateQueuedMessage(queueId, {
      content: body.content,
      attachments: body.attachments,
    });
    return unwrapResult(c, result);
  },
);

queueRouter.delete('/sessions/:id/queue/:queueId', zValidator('param', queueParamSchema), (c) => {
  const { queueId } = c.req.valid('param');
  const result = removeFromQueue(queueId);
  return unwrapResult(c, result, 204);
});
