import { randomUUID } from 'node:crypto';
import { eq, asc } from 'drizzle-orm';
import { Hono } from 'hono';
import type { StoredPart } from '@openwork/shared';
import { getDb } from '../db/client.js';
import { messages, sessions } from '../db/schema.js';
import { providerConfig } from '../db/schema.js';
import { runStream } from '../lib/stream-runner.js';

export const chatRouter = new Hono();

chatRouter.post('/sessions', async (c) => {
  const db = getDb();
  const body = (await c.req.json()) as { title?: string; parentSessionId?: string };
  const id = randomUUID();
  const now = new Date();

  await db.insert(sessions).values({
    id,
    title: body.title ?? null,
    parentSessionId: body.parentSessionId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
  return c.json(row, 201);
});

chatRouter.get('/sessions', async (c) => {
  const db = getDb();
  const rows = await db.select().from(sessions).orderBy(asc(sessions.createdAt));
  return c.json(rows);
});

chatRouter.get('/sessions/:id', async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id');

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  return c.json({ ...session, messages: msgs });
});

chatRouter.delete('/sessions/:id', async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id');

  const result = await db
    .delete(sessions)
    .where(eq(sessions.id, sessionId))
    .returning({ id: sessions.id });

  if (result.length === 0) return c.json({ error: 'Session not found' }, 404);
  return c.body(null, 204);
});

chatRouter.post('/sessions/:id/messages', async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id');

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const body = (await c.req.json()) as {
    content: string;
    providerId: string;
    modelId: string;
    assistantMessageId: string;
  };

  if (!body.content || !body.providerId || !body.modelId || !body.assistantMessageId) {
    return c.json(
      { error: 'content, providerId, modelId and assistantMessageId are required' },
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

  // Persist user message
  const userMessageId = randomUUID();
  const now = Date.now();
  const userPart: StoredPart = {
    type: 'text-delta',
    id: randomUUID(),
    text: body.content,
    startedAt: now,
    endedAt: now,
  };
  await db.insert(messages).values({
    id: userMessageId,
    sessionId,
    role: 'user',
    parts: [userPart],
    createdAt: new Date(now),
    startedAt: new Date(now),
    duration: null,
  });

  await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId));

  // Build conversation history for the LLM
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  const llmMessages = history.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.parts
      .filter((p): p is StoredPart & { type: 'text-delta' } => p.type === 'text-delta')
      .map((p) => p.text)
      .join(''),
  }));

  const assistantMessageId = body.assistantMessageId;
  const modelLabel = `${body.providerId}:::${body.modelId}`;

  void runStream({
    sessionId,
    assistantMessageId,
    modelId: body.modelId,
    modelLabel,
    llmMessages,
    credentials: config.credentials,
  });

  return c.json({ messageId: assistantMessageId, userMessageId }, 202);
});
