import { eq, asc } from 'drizzle-orm';
import { Hono } from 'hono';
import type { ModelMessage, TextPart, ToolCallPart } from 'ai';
import type { PrefixedString, StoredPart } from '@openwork/shared';
import { createSessionId, createMessageId, createPartId } from '@openwork/shared';
import { getDb } from '../db/client.js';
import { messages, sessions, providerConfig } from '../db/schema.js';
import { runStream } from '../lib/stream-runner.js';
import { generateTitle } from '../title-gen/title-generator.js';
import { broadcast } from '../lib/sse.js';
import * as Log from '../lib/log.js';

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

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  return c.json({ ...session, messages: msgs });
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
    createdAt: new Date(now),
    updatedAt: new Date(now),
    startedAt: new Date(now),
    duration: null,
  });

  await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId));

  // Build conversation history for the LLM, preserving tool call/result structure
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  const llmMessages: ModelMessage[] = [];

  for (const msg of history) {
    if (msg.role === 'user') {
      const text = msg.parts
        .filter((p): p is StoredPart & { type: 'text-delta' } => p.type === 'text-delta')
        .map((p) => p.text)
        .join('');
      llmMessages.push({ role: 'user', content: text });
      continue;
    }

    // assistant message — may contain text and tool calls
    const textParts = msg.parts.filter(
      (p): p is StoredPart & { type: 'text-delta' } => p.type === 'text-delta',
    );
    const toolCallParts = msg.parts.filter(
      (p): p is StoredPart & { type: 'tool-call' } => p.type === 'tool-call',
    );
    const toolResultParts = msg.parts.filter(
      (p): p is StoredPart & { type: 'tool-result' } => p.type === 'tool-result',
    );

    if (textParts.length > 0 || toolCallParts.length > 0) {
      const assistantContent: Array<TextPart | ToolCallPart> = [];

      const combinedText = textParts.map((p) => p.text).join('');
      if (combinedText) {
        assistantContent.push({ type: 'text', text: combinedText });
      }

      for (const tc of toolCallParts) {
        assistantContent.push({
          type: 'tool-call',
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.input,
        });
      }

      llmMessages.push({ role: 'assistant', content: assistantContent });
    }

    if (toolResultParts.length > 0) {
      llmMessages.push({
        role: 'tool',
        content: toolResultParts.map((tr) => {
          // Stored output is the raw value — wrap it into the SDK's ToolResultOutput
          // discriminated union so the schema validator accepts it.
          const isError =
            tr.output !== null &&
            tr.output !== undefined &&
            typeof tr.output === 'object' &&
            'error' in (tr.output as object);
          return {
            type: 'tool-result' as const,
            toolCallId: tr.toolCallId,
            toolName: tr.toolName,
            output: isError
              ? { type: 'error-json' as const, value: tr.output as never }
              : { type: 'json' as const, value: tr.output as never },
          };
        }),
      });
    }
  }

  const assistantMessageId = body.assistantMessageId as PrefixedString<'msg'>;

  void runStream({
    sessionId,
    assistantMessageId,
    modelId: body.modelId,
    llmMessages,
    credentials: config.credentials,
  });

  return c.json({ messageId: assistantMessageId, userMessageId }, 202);
});
