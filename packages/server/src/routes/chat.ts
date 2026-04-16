import { Hono } from 'hono';

import type { PrefixedString } from '@stitch/shared/id';

import { generateAutomationDraft } from '@/automations/generation.js';
import {
  abortSessionRun,
  createSession,
  deleteSession,
  getSessionById,
  getSessionStats,
  listSessionMessages,
  listSessions,
  markSessionRead,
  renameSession,
  requestCompaction,
  resolveDoomLoop,
  sendMessage,
  splitSession,
} from '@/chat/service.js';
import { requireFound, unwrapResult } from '@/lib/route-helpers.js';
import type { DoomLoopResponse } from '@/llm/stream/doom-loop.js';

export const chatRouter = new Hono();

chatRouter.post('/sessions', async (c) => {
  const body = await c.req.json<{ title?: string; parentSessionId?: string }>();
  const session = await createSession(body);
  return c.json(session, 201);
});

chatRouter.get('/sessions', async (c) => {
  const type = c.req.query('type');
  const sessionType = type === 'automation' ? 'automation' : 'chat';
  const rows = await listSessions(sessionType);
  return c.json(rows);
});

chatRouter.get('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const result = requireFound(await getSessionById(sessionId), 'Session');
  return unwrapResult(c, result);
});

chatRouter.get('/sessions/:id/stats', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const result = await getSessionStats(sessionId);
  return unwrapResult(c, result);
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
  const result = requireFound(deleted, 'Session');
  return unwrapResult(c, result, 204);
});

chatRouter.patch('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  const body = await c.req.json<{ title: string }>();

  if (!body.title) {
    return c.json({ error: 'Title is required' }, 400);
  }

  const updated = await renameSession(sessionId, body.title);
  const result = requireFound(updated, 'Session');
  return unwrapResult(c, result);
});

chatRouter.patch('/sessions/:id/read', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  const updated = await markSessionRead(sessionId);
  const result = requireFound(updated, 'Session');
  return unwrapResult(c, result, 204);
});

chatRouter.post('/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  const body = await c.req.json<{
    content: string;
    providerId: string;
    modelId: string;
    assistantMessageId: string;
    attachments?: Array<{
      path: string;
      mime: string;
      filename: string;
    }>;
  }>();

  if (!body.content || !body.providerId || !body.modelId || !body.assistantMessageId) {
    return c.json(
      { error: 'content, providerId, modelId, and assistantMessageId are required' },
      400,
    );
  }

  const result = await sendMessage({
    sessionId,
    content: body.content,
    attachments: body.attachments,
    providerId: body.providerId,
    modelId: body.modelId,
    assistantMessageId: body.assistantMessageId,
  });
  return unwrapResult(c, result, 202);
});

chatRouter.post('/sessions/:id/doom-loop-response', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  const body = await c.req.json<{ response: DoomLoopResponse }>();

  if (body.response !== 'continue' && body.response !== 'stop') {
    return c.json({ error: 'response must be "continue" or "stop"' }, 400);
  }

  const result = resolveDoomLoop(sessionId, body.response);
  return unwrapResult(c, result);
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
  return unwrapResult(c, result, 201);
});

chatRouter.post('/sessions/:id/compact', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const result = await requestCompaction(sessionId);
  return unwrapResult(c, result, 202);
});

chatRouter.post('/sessions/:id/generate-automation', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const result = await generateAutomationDraft(sessionId);
  return unwrapResult(c, result, 201);
});
