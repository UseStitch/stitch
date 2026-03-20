import { and, asc, desc, eq, like, lt } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createMessageId, createPartId, createSessionId } from '@stitch/shared/id';
import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { agents, messages, providerConfig, sessions } from '@/db/schema.js';
import * as AbortRegistry from '@/lib/abort-registry.js';
import * as Log from '@/lib/log.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { broadcast } from '@/lib/sse.js';
import { runStream } from '@/lib/stream-runner.js';
import { buildCompactedHistory, compact } from '@/llm/compaction.js';
import { cancelDecision, resolveDecision, type DoomLoopResponse } from '@/llm/doom-loop.js';
import { generateTitle } from '@/llm/title-generator.js';
import { abortPermissionResponses } from '@/permission/service.js';
import { abortQuestions } from '@/question/service.js';
import { calculateMessageCostUsd } from '@/utils/cost.js';

const log = Log.create({ service: 'chat-service' });

const DEFAULT_PAGE_SIZE = 50;

type CreateSessionInput = {
  title?: string;
  parentSessionId?: string;
};

type SendMessageInput = {
  sessionId: PrefixedString<'ses'>;
  content: string;
  attachments?: Array<{
    path: string;
    mime: string;
    filename: string;
  }>;
  providerId: string;
  modelId: string;
  agentId: string;
  assistantMessageId: string;
};

export async function createSession(input: CreateSessionInput) {
  const db = getDb();
  const id = createSessionId();
  const now = Date.now();
  const title = input.title ?? `New Session ${new Date(now).toLocaleString('en-US', { hour12: false })}`;

  await db.insert(sessions).values({
    id,
    title,
    parentSessionId: (input.parentSessionId ?? null) as PrefixedString<'ses'> | null,
    createdAt: now,
    updatedAt: now,
  });

  const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
  return session;
}

export async function listSessions() {
  const db = getDb();
  return db.select().from(sessions).orderBy(asc(sessions.createdAt));
}

export async function getSessionById(sessionId: PrefixedString<'ses'>) {
  const db = getDb();
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  return session;
}

export async function listSessionMessages(sessionId: PrefixedString<'ses'>, limit?: number, cursor?: number) {
  const db = getDb();
  const pageSize = limit ? Math.min(Math.max(limit, 1), 200) : DEFAULT_PAGE_SIZE;

  const conditions = [eq(messages.sessionId, sessionId)];
  if (cursor !== undefined) {
    conditions.push(lt(messages.createdAt, cursor));
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  page.reverse();
  return { messages: page, hasMore };
}

export async function deleteSession(sessionId: PrefixedString<'ses'>) {
  const db = getDb();
  const result = await db
    .delete(sessions)
    .where(eq(sessions.id, sessionId))
    .returning({ id: sessions.id });
  return result.length > 0;
}

export async function renameSession(sessionId: PrefixedString<'ses'>, title: string) {
  const db = getDb();
  const [updated] = await db
    .update(sessions)
    .set({ title, updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId))
    .returning();
  return updated;
}

async function maybeGenerateTitle(input: {
  sessionId: PrefixedString<'ses'>;
  userText: string;
  providerId: string;
  modelId: string;
  agentId: PrefixedString<'agt'>;
}): Promise<void> {
  const db = getDb();

  const existingMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, input.sessionId));
  if (existingMessages.length > 0) {
    return;
  }

  generateTitle(input.userText, input.providerId, input.modelId)
    .then(async (generatedTitle) => {
      if (!generatedTitle) {
        return;
      }

      const now = Date.now();
      const titleMessageId = createMessageId();
      const titlePart: StoredPart = {
        type: 'session-title',
        id: createPartId(),
        title: generatedTitle.title,
        startedAt: now,
        endedAt: now,
      };

      const costUsd = generatedTitle.usage
        ? await calculateMessageCostUsd({
            providerId: generatedTitle.providerId,
            modelId: generatedTitle.modelId,
            usage: generatedTitle.usage,
          })
        : 0;

      await db.insert(messages).values({
        id: titleMessageId,
        sessionId: input.sessionId,
        role: 'assistant',
        parts: [titlePart],
        modelId: generatedTitle.modelId,
        providerId: generatedTitle.providerId,
        agentId: input.agentId,
        usage: generatedTitle.usage ?? undefined,
        costUsd,
        finishReason: 'stop',
        isSummary: false,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        duration: 0,
      });

      await db
        .update(sessions)
        .set({ title: generatedTitle.title, updatedAt: Date.now() })
        .where(eq(sessions.id, input.sessionId));

      await broadcast('session-title-update', { sessionId: input.sessionId, title: generatedTitle.title });
    })
    .catch((error) => {
      log.error({ sessionId: input.sessionId, error }, 'title generation failed');
    });
}

export async function sendMessage(input: SendMessageInput): Promise<ServiceResult<{ messageId: string; userMessageId: string }>> {
  const db = getDb();

  const [session] = await db.select().from(sessions).where(eq(sessions.id, input.sessionId));
  if (!session) {
    return err('Session not found', 404);
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, input.agentId as PrefixedString<'agt'>));
  if (!agent) {
    return err(`Agent "${input.agentId}" not found`, 400);
  }
  if (agent.type !== 'primary') {
    return err('Sub agents cannot be used directly in chat', 400);
  }

  const [config] = await db
    .select()
    .from(providerConfig)
    .where(eq(providerConfig.providerId, input.providerId));
  if (!config) {
    return err(`Provider "${input.providerId}" is not configured`, 400);
  }

  await maybeGenerateTitle({
    sessionId: input.sessionId,
    userText: input.content,
    providerId: input.providerId,
    modelId: input.modelId,
    agentId: agent.id,
  });

  const userMessageId = createMessageId();
  const now = Date.now();
  const userPart: StoredPart = {
    type: 'text-delta',
    id: createPartId(),
    text: input.content,
    startedAt: now,
    endedAt: now,
  };

  const attachmentParts: StoredPart[] = await Promise.all(
    (input.attachments ?? []).map(async (att): Promise<StoredPart> => {
      const resolvedPath = path.resolve(att.path);
      const fileBuffer = await fs.readFile(resolvedPath);

      if (att.mime.startsWith('image/')) {
        const dataUrl = `data:${att.mime};base64,${fileBuffer.toString('base64')}`;
        return {
          type: 'user-image' as const,
          id: createPartId(),
          dataUrl,
          mime: att.mime,
          filename: att.filename,
          startedAt: now,
          endedAt: now,
        };
      }

      if (att.mime === 'application/pdf') {
        const dataUrl = `data:application/pdf;base64,${fileBuffer.toString('base64')}`;
        return {
          type: 'user-file' as const,
          id: createPartId(),
          dataUrl,
          mime: att.mime,
          filename: att.filename,
          startedAt: now,
          endedAt: now,
        };
      }

      return {
        type: 'user-text-file' as const,
        id: createPartId(),
        content: fileBuffer.toString('utf8'),
        mime: att.mime,
        filename: att.filename,
        startedAt: now,
        endedAt: now,
      };
    }),
  );

  await db.insert(messages).values({
    id: userMessageId,
    sessionId: input.sessionId,
    role: 'user',
    parts: [userPart, ...attachmentParts],
    modelId: input.modelId,
    providerId: input.providerId,
    agentId: agent.id,
    costUsd: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    duration: null,
  });

  await db.update(sessions).set({ updatedAt: Date.now() }).where(eq(sessions.id, input.sessionId));

  const llmMessages = await buildCompactedHistory(input.sessionId, {
    useBasePrompt: agent.useBasePrompt,
    systemPrompt: agent.systemPrompt,
  });
  const assistantMessageId = input.assistantMessageId as PrefixedString<'msg'>;
  const abortSignal = AbortRegistry.register(input.sessionId);

  void runStream({
    sessionId: input.sessionId,
    assistantMessageId,
    modelId: input.modelId,
    agentId: agent.id,
    llmMessages,
    credentials: config.credentials,
    abortSignal,
  })
    .catch((error) => {
      log.error(
        {
          event: 'stream.failed',
          sessionId: input.sessionId,
          messageId: assistantMessageId,
          error,
        },
        'stream run failed',
      );
    })
    .finally(() => {
      AbortRegistry.cleanup(input.sessionId);
    });

  return ok({ messageId: assistantMessageId, userMessageId });
}

export function resolveDoomLoop(
  sessionId: PrefixedString<'ses'>,
  response: DoomLoopResponse,
): ServiceResult<{ ok: true }> {
  const resolved = resolveDecision(sessionId, response);
  if (!resolved) {
    return err('No pending doom loop prompt for this session', 404);
  }

  return ok({ ok: true });
}

export async function abortSessionRun(sessionId: PrefixedString<'ses'>) {
  log.info({ event: 'stream.abort.requested', sessionId }, 'stream abort requested');
  AbortRegistry.abort(sessionId);
  cancelDecision(sessionId);
  await abortQuestions(sessionId);
  await abortPermissionResponses(sessionId);
}

function getSplitTitle(baseTitle: string, n: number): string {
  return `${baseTitle} Split #${n}`;
}

function parseSplitTitle(title: string): { base: string; n: number } | null {
  const match = title.match(/^(.+) Split #(\d+)$/);
  if (!match) return null;
  return { base: match[1]!, n: parseInt(match[2]!, 10) };
}

export async function splitSession(
  sessionId: PrefixedString<'ses'>,
  msgId: PrefixedString<'msg'>,
): Promise<ServiceResult<{ session: (typeof sessions.$inferSelect); prefillText: string }>> {
  const db = getDb();

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return err('Session not found', 404);

  const [splitMsg] = await db.select().from(messages).where(eq(messages.id, msgId));
  if (!splitMsg) return err('Message not found', 404);
  if (splitMsg.role !== 'user') return err('Can only split from user messages', 400);

  const priorMessages = await db
    .select()
    .from(messages)
    .where(and(eq(messages.sessionId, sessionId), lt(messages.createdAt, splitMsg.createdAt)))
    .orderBy(asc(messages.createdAt));

  const baseTitle = session.title ?? 'Session';
  const parsed = parseSplitTitle(baseTitle);
  const lookupBase = parsed ? parsed.base : baseTitle;

  const existing = await db
    .select({ title: sessions.title })
    .from(sessions)
    .where(like(sessions.title, `${lookupBase} Split #%`));

  let maxN = 0;
  for (const row of existing) {
    if (!row.title) continue;
    const p = parseSplitTitle(row.title);
    if (p && p.base === lookupBase && p.n > maxN) maxN = p.n;
  }

  const newTitle = getSplitTitle(lookupBase, maxN + 1);
  const newSessionId = createSessionId();
  const now = Date.now();

  await db.insert(sessions).values({
    id: newSessionId,
    title: newTitle,
    parentSessionId: sessionId,
    createdAt: now,
    updatedAt: now,
  });

  for (const msg of priorMessages) {
    const newMsgId = createMessageId();
    await db.insert(messages).values({
      ...msg,
      id: newMsgId,
      sessionId: newSessionId,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    });
  }

  const [newSession] = await db.select().from(sessions).where(eq(sessions.id, newSessionId));

  const prefillText = splitMsg.parts
    .filter((p): p is StoredPart & { type: 'text-delta'; text: string } => p.type === 'text-delta')
    .map((p) => p.text)
    .join('');

  return ok({ session: newSession!, prefillText });
}

export async function requestCompaction(sessionId: PrefixedString<'ses'>): Promise<ServiceResult<{ ok: true }>> {
  const db = getDb();

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return err('Session not found', 404);
  }

  const lastMessage = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt))
    .then((rows) => rows.at(-1));

  if (!lastMessage) {
    return err('Session has no messages to compact', 400);
  }

  void compact({
    sessionId,
    providerId: lastMessage.providerId,
    modelId: lastMessage.modelId,
    agentId: lastMessage.agentId as PrefixedString<'agt'>,
    auto: false,
  });

  return ok({ ok: true });
}
