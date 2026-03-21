import { Hono } from 'hono';

import type { PrefixedString } from '@stitch/shared/id';

import {
  abortSessionRun,
  createSession,
  deleteSession,
  getSessionById,
  listSessionMessages,
  listSessions,
  markSessionRead,
  renameSession,
  requestCompaction,
  resolveDoomLoop,
  sendMessage,
  splitSession,
} from '@/chat/service.js';
import { isServiceError } from '@/lib/service-result.js';
import type { DoomLoopResponse } from '@/llm/doom-loop.js';

export const chatRouter = new Hono();

chatRouter.post('/sessions', async (c) => {
  const body = (await c.req.json()) as { title?: string; parentSessionId?: string };
  const session = await createSession(body);
  return c.json(session, 201);
});

chatRouter.get('/sessions', async (c) => {
  const rows = await listSessions();
  return c.json(rows);
});

chatRouter.get('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const session = await getSessionById(sessionId);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  return c.json(session);
});

chatRouter.get('/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const limitParam = c.req.query('limit');
  const cursorParam = c.req.query('cursor');
  const limit = limitParam ? Number(limitParam) : undefined;
  const cursor = cursorParam ? Number(cursorParam) : undefined;

  const page = await listSessionMessages(sessionId, limit, cursor);
  return c.json(page);
});

chatRouter.delete('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const deleted = await deleteSession(sessionId);
  if (!deleted) return c.json({ error: 'Session not found' }, 404);
  return c.body(null, 204);
});

chatRouter.patch('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  const body = (await c.req.json()) as { title: string };

  if (!body.title) {
    return c.json({ error: 'Title is required' }, 400);
  }

  const updated = await renameSession(sessionId, body.title);
  if (!updated) return c.json({ error: 'Session not found' }, 404);
  return c.json(updated);
});

chatRouter.patch('/sessions/:id/read', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  const updated = await markSessionRead(sessionId);
  if (!updated) return c.json({ error: 'Session not found' }, 404);
  return c.body(null, 204);
});

chatRouter.post('/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  const body = (await c.req.json()) as {
    content: string;
    providerId: string;
    modelId: string;
    agentId: string;
    assistantMessageId: string;
    attachments?: Array<{
      path: string;
      mime: string;
      filename: string;
    }>;
  };

  if (
    !body.content ||
    !body.providerId ||
    !body.modelId ||
    !body.agentId ||
    !body.assistantMessageId
  ) {
    return c.json(
      { error: 'content, providerId, modelId, agentId, and assistantMessageId are required' },
      400,
    );
  }

  const result = await sendMessage({
    sessionId,
    content: body.content,
    attachments: body.attachments,
    providerId: body.providerId,
    modelId: body.modelId,
    agentId: body.agentId,
    assistantMessageId: body.assistantMessageId,
  });
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.data, 202);
});

chatRouter.post('/sessions/:id/doom-loop-response', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  const body = (await c.req.json()) as { response: DoomLoopResponse };

  if (body.response !== 'continue' && body.response !== 'stop') {
    return c.json({ error: 'response must be "continue" or "stop"' }, 400);
  }

  const result = resolveDoomLoop(sessionId, body.response);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.data);
});

chatRouter.post('/sessions/:id/abort', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  await abortSessionRun(sessionId);
  return c.json({ ok: true });
});

chatRouter.post('/sessions/:id/split/:msgId', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  const msgId = c.req.param('msgId') as PrefixedString<'msg'>;

  const result = await splitSession(sessionId, msgId);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.data, 201);
});

chatRouter.post('/sessions/:id/compact', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const result = await requestCompaction(sessionId);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.data, 202);
});
