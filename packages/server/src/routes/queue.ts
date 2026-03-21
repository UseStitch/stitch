import { Hono } from 'hono';

import type { PrefixedString } from '@stitch/shared/id';

import type { QueuedMessageAttachment } from '@stitch/shared/chat/queue';

import {
  addToQueue,
  listQueuedMessages,
  removeFromQueue,
  updateQueuedMessage,
} from '@/queue/service.js';

export const queueRouter = new Hono();

queueRouter.get('/sessions/:id/queue', (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  const rows = listQueuedMessages(sessionId);
  return c.json(rows);
});

queueRouter.post('/sessions/:id/queue', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  const body = (await c.req.json()) as {
    content: string;
    attachments?: QueuedMessageAttachment[];
  };

  if (!body.content?.trim() && (!body.attachments || body.attachments.length === 0)) {
    return c.json({ error: 'content or attachments are required' }, 400);
  }

  const row = addToQueue({
    sessionId,
    content: body.content ?? '',
    attachments: body.attachments,
  });

  return c.json(row, 201);
});

queueRouter.patch('/sessions/:id/queue/:queueId', async (c) => {
  const queueId = c.req.param('queueId') as PrefixedString<'qmsg'>;
  const body = (await c.req.json()) as {
    content?: string;
    attachments?: QueuedMessageAttachment[];
  };

  const row = updateQueuedMessage(queueId, {
    content: body.content,
    attachments: body.attachments,
  });

  if (!row) return c.json({ error: 'Queued message not found' }, 404);
  return c.json(row);
});

queueRouter.delete('/sessions/:id/queue/:queueId', (c) => {
  const queueId = c.req.param('queueId') as PrefixedString<'qmsg'>;

  const row = removeFromQueue(queueId);
  if (!row) return c.json({ error: 'Queued message not found' }, 404);
  return c.body(null, 204);
});
