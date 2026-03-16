import { eq, asc, desc, lt, and } from 'drizzle-orm';
import { Hono } from 'hono';

import type { PrefixedString } from '@openwork/shared';
import { createSessionId, createMessageId, createPartId } from '@openwork/shared';
import type { StoredPart } from '@openwork/shared';

import { getDb } from '@/db/client.js';
import { messages, sessions, providerConfig } from '@/db/schema.js';
import * as AbortRegistry from '@/lib/abort-registry.js';
import * as Log from '@/lib/log.js';
import { broadcast } from '@/lib/sse.js';
import { runStream } from '@/lib/stream-runner.js';
import { buildCompactedHistory, compact } from '@/llm/compaction.js';
import { cancelDecision, resolveDecision, type DoomLoopResponse } from '@/llm/doom-loop.js';
import { generateTitle } from '@/llm/title-generator.js';
import { abortQuestions } from '@/question/service.js';

const log = Log.create({ service: 'chat' });

export const chatRouter = new Hono();

chatRouter.post('/sessions', async (c) => {
  const db = getDb();
  const body = (await c.req.json()) as { title?: string; parentSessionId?: string };
  const id = createSessionId();
  const now = new Date();

  const title = body.title ?? `New Session ${now.toLocaleString('en-US', { hour12: false })}`;

  await db.insert(sessions).values({
    id,
    title,
    parentSessionId: (body.parentSessionId ?? null) as PrefixedString<'ses'> | null,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
  return c.json(row, 201);
});

chatRouter.get('/sessions', async (c) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.sessionType, 'user'))
    .orderBy(asc(sessions.createdAt));
  return c.json(rows);
});

chatRouter.get('/sessions/:id', async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return c.json({ error: 'Session not found' }, 404);

  return c.json(session);
});

const DEFAULT_PAGE_SIZE = 50;

chatRouter.get('/sessions/:id/messages', async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const limitParam = c.req.query('limit');
  const cursorParam = c.req.query('cursor');
  const limit = limitParam ? Math.min(Math.max(Number(limitParam), 1), 200) : DEFAULT_PAGE_SIZE;

  const conditions = [eq(messages.sessionId, sessionId)];
  if (cursorParam) {
    conditions.push(lt(messages.createdAt, new Date(Number(cursorParam))));
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Return messages in chronological order (oldest first)
  page.reverse();

  return c.json({ messages: page, hasMore });
});

chatRouter.delete('/sessions/:id', async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const result = await db
    .delete(sessions)
    .where(eq(sessions.id, sessionId))
    .returning({ id: sessions.id });

  if (result.length === 0) return c.json({ error: 'Session not found' }, 404);
  return c.body(null, 204);
});

chatRouter.patch('/sessions/:id', async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  const body = (await c.req.json()) as { title: string };

  if (!body.title) {
    return c.json({ error: 'Title is required' }, 400);
  }

  const [updated] = await db
    .update(sessions)
    .set({ title: body.title, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .returning();

  if (!updated) return c.json({ error: 'Session not found' }, 404);
  return c.json(updated);
});

chatRouter.post('/sessions/:id/messages', async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const body = (await c.req.json()) as {
    content: string;
    providerId: string;
    modelId: string;
    agentId: string;
    assistantMessageId: string;
  };

  if (!body.content || !body.providerId || !body.modelId || !body.agentId || !body.assistantMessageId) {
    return c.json(
      { error: 'content, providerId, modelId, agentId, and assistantMessageId are required' },
      400,
    );
  }

  const [config] = await db
    .select()
    .from(providerConfig)
    .where(eq(providerConfig.providerId, body.providerId));

  if (!config) {
    return c.json({ error: `Provider "${body.providerId}" is not configured` }, 400);
  }

  const existingMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId));

  const isFirstMessage = existingMessages.length === 0;

  if (isFirstMessage) {
    generateTitle(body.content, body.providerId, body.modelId)
      .then(async (title) => {
        if (title) {
          await db
            .update(sessions)
            .set({ title, updatedAt: new Date() })
            .where(eq(sessions.id, sessionId));
          await broadcast('session-title-update', { sessionId, title });
        }
      })
      .catch((err) => {
        log.error('title generation failed', { sessionId, error: err });
      });
  }

  // Persist user message
  const userMessageId = createMessageId();
  const now = Date.now();
  const userPart: StoredPart = {
    type: 'text-delta',
    id: createPartId(),
    text: body.content,
    startedAt: now,
    endedAt: now,
  };
  await db.insert(messages).values({
    id: userMessageId,
    sessionId,
    role: 'user',
    parts: [userPart],
    modelId: body.modelId,
    providerId: body.providerId,
    agentId: body.agentId as PrefixedString<'agt'>,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    startedAt: new Date(now),
    duration: null,
  });

  await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId));

  // Build conversation history respecting compaction boundaries
  const llmMessages = await buildCompactedHistory(sessionId);

  const assistantMessageId = body.assistantMessageId as PrefixedString<'msg'>;

  const abortSignal = AbortRegistry.register(sessionId);

  void runStream({
    sessionId,
    assistantMessageId,
    modelId: body.modelId,
    agentId: body.agentId,
    llmMessages,
    credentials: config.credentials,
    abortSignal,
  }).finally(() => {
    AbortRegistry.cleanup(sessionId);
  });

  return c.json({ messageId: assistantMessageId, userMessageId }, 202);
});

chatRouter.post('/sessions/:id/doom-loop-response', async (c) => {
  const sessionId = c.req.param('id');
  const body = (await c.req.json()) as { response: DoomLoopResponse };

  if (body.response !== 'continue' && body.response !== 'stop') {
    return c.json({ error: 'response must be "continue" or "stop"' }, 400);
  }

  const resolved = resolveDecision(sessionId, body.response);
  if (!resolved) {
    return c.json({ error: 'No pending doom loop prompt for this session' }, 404);
  }

  return c.json({ ok: true });
});

chatRouter.post('/sessions/:id/abort', async (c) => {
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;
  AbortRegistry.abort(sessionId);
  cancelDecision(sessionId);
  await abortQuestions(sessionId);
  return c.json({ ok: true });
});

chatRouter.post('/sessions/:id/compact', async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return c.json({ error: 'Session not found' }, 404);

  // Find the last message to get a fallback providerId/modelId
  const lastMsg = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt))
    .then((msgs) => msgs.at(-1));

  if (!lastMsg) {
    return c.json({ error: 'Session has no messages to compact' }, 400);
  }

  void compact({
    sessionId,
    providerId: lastMsg.providerId,
    modelId: lastMsg.modelId,
    agentId: lastMsg.agentId as PrefixedString<'agt'>,
    auto: false,
  });

  return c.json({ ok: true }, 202);
});
