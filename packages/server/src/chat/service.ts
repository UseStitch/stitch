import { and, asc, desc, eq, inArray, isNull, like, lt } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { StoredPart } from '@stitch/shared/chat/messages';
import type { SessionStats } from '@stitch/shared/chat/messages';
import { createMessageId, createPartId, createSessionId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { saveTitleMessage } from '@/chat/message-store.js';
import { getDb } from '@/db/client.js';
import { providerConfig } from '@/db/schema/providers.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import * as AbortRegistry from '@/lib/abort-registry.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { err, isServiceError, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { compact } from '@/llm/compaction.js';
import { buildSessionLlmMessages } from '@/llm/session-history.js';
import { cancelDecision, resolveDecision, type DoomLoopResponse } from '@/llm/stream/doom-loop.js';
import { runStream } from '@/llm/stream/runner.js';
import { generateTitle } from '@/llm/title-generator.js';
import * as Models from '@/models/llm/registry.js';
import { abortPermissionResponses } from '@/permission/service.js';
import {
  listProvidersWithCapabilities,
  type ProviderWithCapabilities,
} from '@/provider/service.js';
import { abortQuestions } from '@/question/service.js';
import { recordLlmUsage } from '@/usage/ledger.js';

const log = Log.create({ service: 'chat-service' });

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_SESSION_PAGE_SIZE = 30;

type CreateSessionInput = {
  title?: string;
  type?: 'chat' | 'automation';
  automationId?: PrefixedString<'auto'>;
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
  assistantMessageId: string;
};

export async function createSession(
  input: CreateSessionInput,
): Promise<ServiceResult<typeof sessions.$inferSelect>> {
  const db = getDb();
  const id = createSessionId();
  const now = Date.now();
  const title =
    input.title ?? `New Session ${new Date(now).toLocaleString('en-US', { hour12: false })}`;

  const [session] = await db
    .insert(sessions)
    .values({
      id,
      title,
      type: input.type ?? 'chat',
      automationId: input.automationId ?? null,
      parentSessionId: (input.parentSessionId ?? null) as PrefixedString<'ses'> | null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return ok(session);
}

export async function listSessions(
  type: 'chat' | 'automation' = 'chat',
  options: { limit?: number; cursor?: number; search?: string } = {},
): Promise<ServiceResult<{ sessions: (typeof sessions.$inferSelect)[]; hasMore: boolean }>> {
  const db = getDb();
  const pageSize = options.limit
    ? Math.min(Math.max(options.limit, 1), 100)
    : DEFAULT_SESSION_PAGE_SIZE;

  const conditions = [eq(sessions.type, type)];
  if (options.cursor !== undefined) {
    conditions.push(lt(sessions.createdAt, options.cursor));
  }
  if (options.search) {
    conditions.push(like(sessions.title, `%${options.search}%`));
  }
  if (type === 'chat') {
    conditions.push(isNull(sessions.parentSessionId));
  }

  const rows = await db
    .select()
    .from(sessions)
    .where(and(...conditions))
    .orderBy(desc(sessions.createdAt))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  return ok({ sessions: page, hasMore });
}

export async function getSessionById(sessionId: PrefixedString<'ses'>) {
  const db = getDb();
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  return session;
}

export async function listSessionMessages(
  sessionId: PrefixedString<'ses'>,
  limit?: number,
  cursor?: number,
): Promise<ServiceResult<{ messages: (typeof messages.$inferSelect)[]; hasMore: boolean }>> {
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
  return ok({ messages: page, hasMore });
}

export async function deleteSession(
  sessionId: PrefixedString<'ses'>,
): Promise<ServiceResult<{ id: string }>> {
  const db = getDb();
  const result = await db
    .delete(sessions)
    .where(eq(sessions.id, sessionId))
    .returning({ id: sessions.id });
  if (result.length === 0) return err('Session not found', 404);
  return ok(result[0]);
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

export async function markSessionRead(sessionId: PrefixedString<'ses'>) {
  const db = getDb();
  const [updated] = await db
    .update(sessions)
    .set({ isUnread: false, updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId))
    .returning();
  return updated ?? null;
}

async function maybeGenerateTitle(input: {
  sessionId: PrefixedString<'ses'>;
  userText: string;
  attachmentFilenames?: string[];
  providerId: string;
  modelId: string;
}): Promise<void> {
  const db = getDb();

  const existingMessages = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.sessionId, input.sessionId))
    .limit(1);
  if (existingMessages.length > 0) {
    return;
  }

  generateTitle(input.userText, input.providerId, input.modelId, input.attachmentFilenames)
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

      const { costUsd } = await recordLlmUsage({
        runId: titleMessageId,
        source: 'title_generation',
        status: 'succeeded',
        sessionId: input.sessionId,
        messageId: titleMessageId,
        providerId: generatedTitle.providerId,
        modelId: generatedTitle.modelId,
        usage: generatedTitle.usage ?? null,
        metadata: {
          phase: 'title-generation',
        },
        startedAt: now,
        endedAt: now,
        durationMs: 0,
      });

      await saveTitleMessage({
        sessionId: input.sessionId,
        messageId: titleMessageId,
        modelId: generatedTitle.modelId,
        providerId: generatedTitle.providerId,
        parts: [titlePart],
        usage: generatedTitle.usage ?? undefined,
        costUsd,
        createdAt: now,
      });

      await db
        .update(sessions)
        .set({ title: generatedTitle.title, updatedAt: Date.now() })
        .where(eq(sessions.id, input.sessionId));

      internalBus.emit('session.title.updated', {
        sessionId: input.sessionId,
        title: generatedTitle.title,
      });
    })
    .catch((error) => {
      log.error({ sessionId: input.sessionId, error }, 'title generation failed');
    });
}

export async function sendMessage(
  input: SendMessageInput,
): Promise<ServiceResult<{ messageId: string; userMessageId: string }>> {
  const db = getDb();

  const [session] = await db.select().from(sessions).where(eq(sessions.id, input.sessionId));
  if (!session) {
    return err('Session not found', 404);
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
    attachmentFilenames: input.attachments?.map((att) => att.filename),
    providerId: input.providerId,
    modelId: input.modelId,
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
    costUsd: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    duration: null,
  });

  await db.update(sessions).set({ updatedAt: Date.now() }).where(eq(sessions.id, input.sessionId));

  const llmMessages = await buildSessionLlmMessages(input.sessionId, {
    useBasePrompt: true,
    systemPrompt: null,
  });
  const assistantMessageId = input.assistantMessageId as PrefixedString<'msg'>;
  const abortSignal = AbortRegistry.register(input.sessionId);

  void runStream({
    sessionId: input.sessionId,
    assistantMessageId,
    modelId: input.modelId,
    llmMessages,
    credentials: config.credentials,
    abortSignal,
    allowTaskTool: session.parentSessionId === null,
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

  const db = getDb();
  const childSessions = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.parentSessionId, sessionId));

  await Promise.all([
    abortQuestions(sessionId),
    abortPermissionResponses(sessionId),
    ...childSessions.map(async (child) => {
      AbortRegistry.abort(child.id);
      cancelDecision(child.id);
      await Promise.all([abortQuestions(child.id), abortPermissionResponses(child.id)]);
    }),
  ]);
}

function getSplitTitle(baseTitle: string, n: number): string {
  return `${baseTitle} Split #${n}`;
}

function parseSplitTitle(title: string): { base: string; n: number } | null {
  const match = title.match(/^(.+) Split #(\d+)$/);
  if (!match) return null;
  return { base: match[1], n: parseInt(match[2], 10) };
}

export async function splitSession(
  sessionId: PrefixedString<'ses'>,
  msgId: PrefixedString<'msg'>,
): Promise<ServiceResult<{ session: typeof sessions.$inferSelect; prefillText: string }>> {
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

  const [newSession] = await db
    .insert(sessions)
    .values({
      id: newSessionId,
      title: newTitle,
      parentSessionId: sessionId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (priorMessages.length > 0) {
    await db.insert(messages).values(
      priorMessages.map((msg) => ({
        ...msg,
        id: createMessageId(),
        sessionId: newSessionId,
        usage: undefined,
        costUsd: 0,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
      })),
    );
  }

  const prefillText = splitMsg.parts
    .filter((p): p is StoredPart & { type: 'text-delta'; text: string } => p.type === 'text-delta')
    .map((p) => p.text)
    .join('');

  return ok({ session: newSession, prefillText });
}

export async function requestCompaction(
  sessionId: PrefixedString<'ses'>,
): Promise<ServiceResult<{ ok: true }>> {
  const db = getDb();

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return err('Session not found', 404);
  }

  const lastMessage = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(desc(messages.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  if (!lastMessage) {
    return err('Session has no messages to compact', 400);
  }

  void compact({
    sessionId,
    providerId: lastMessage.providerId,
    modelId: lastMessage.modelId,
    auto: false,
  });

  return ok({ ok: true });
}

export async function getSessionStats(
  sessionId: PrefixedString<'ses'>,
): Promise<ServiceResult<SessionStats>> {
  const db = getDb();

  const getMessageTokens = (usage: (typeof messages.$inferSelect)['usage']): number =>
    usage?.totalTokens ??
    (usage?.inputTokens ?? 0) +
      (usage?.outputTokens ?? 0) +
      (usage?.outputTokenDetails?.reasoningTokens ?? 0);

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return err('Session not found', 404);
  }

  const [sessionMessages, childSessions] = await Promise.all([
    db
      .select({
        costUsd: messages.costUsd,
        usage: messages.usage,
        role: messages.role,
        parts: messages.parts,
        providerId: messages.providerId,
        modelId: messages.modelId,
      })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt)),
    db.select({ id: sessions.id }).from(sessions).where(eq(sessions.parentSessionId, sessionId)),
  ]);

  const currentSessionCostUsd = sessionMessages.reduce((acc, m) => acc + (m.costUsd ?? 0), 0);
  const currentSessionTokens = sessionMessages.reduce(
    (acc, m) => acc + getMessageTokens(m.usage),
    0,
  );
  const userMessageCount = sessionMessages.filter((m) => m.role === 'user').length;
  const assistantMessageCount = sessionMessages.filter((m) => m.role === 'assistant').length;

  let childSessionsCostUsd = 0;
  let childSessionsTokens = 0;
  if (childSessions.length > 0) {
    const childIds = childSessions.map((c) => c.id);
    const childMsgs = await db
      .select({ costUsd: messages.costUsd, usage: messages.usage })
      .from(messages)
      .where(inArray(messages.sessionId, childIds));

    childSessionsCostUsd = childMsgs.reduce((acc, m) => acc + (m.costUsd ?? 0), 0);
    childSessionsTokens = childMsgs.reduce((acc, m) => acc + getMessageTokens(m.usage), 0);
  }

  // Find the latest assistant message with token usage (for context window stats)
  let latestAssistantWithTokens: (typeof sessionMessages)[number] | null = null;
  for (let i = sessionMessages.length - 1; i >= 0; i--) {
    const msg = sessionMessages[i];
    if (!msg || msg.role !== 'assistant') continue;
    if (msg.parts?.some((p) => p.type === 'session-title')) continue;
    const usage = msg.usage;
    const tokenSum =
      usage?.totalTokens ??
      (usage?.inputTokens ?? 0) +
        (usage?.outputTokens ?? 0) +
        (usage?.outputTokenDetails?.reasoningTokens ?? 0);
    if (tokenSum > 0) {
      latestAssistantWithTokens = msg;
      break;
    }
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;

  if (latestAssistantWithTokens) {
    const usage = latestAssistantWithTokens.usage;
    inputTokens = usage?.inputTokens ?? 0;
    outputTokens = usage?.outputTokens ?? 0;
    cacheReadTokens = usage?.inputTokenDetails?.cacheReadTokens ?? 0;
    cacheWriteTokens = usage?.inputTokenDetails?.cacheWriteTokens ?? 0;
    reasoningTokens = usage?.outputTokenDetails?.reasoningTokens ?? 0;
  }

  const totalTokens = latestAssistantWithTokens?.usage?.totalTokens ?? inputTokens + outputTokens;

  // Resolve provider/model labels and context limit
  const latestMessage =
    sessionMessages.length > 0 ? sessionMessages[sessionMessages.length - 1] : null;
  const [providersResult, modelCatalog] = await Promise.all([
    listProvidersWithCapabilities(),
    Models.get(),
  ]);
  const providers: ProviderWithCapabilities[] = isServiceError(providersResult)
    ? []
    : providersResult.data;

  let providerLabel = '-';
  let modelLabel = '-';
  let contextLimit: number | null = null;

  if (latestMessage) {
    const provider = providers.find((p) => p.id === latestMessage.providerId);
    providerLabel = provider?.name ?? latestMessage.providerId;

    const providerModels = modelCatalog[latestMessage.providerId];
    const model = providerModels?.models[latestMessage.modelId];
    modelLabel = model?.name ?? latestMessage.modelId;
  }

  if (latestAssistantWithTokens) {
    const providerModels = modelCatalog[latestAssistantWithTokens.providerId];
    const model = providerModels?.models[latestAssistantWithTokens.modelId];
    contextLimit = model?.limit?.context ?? null;
  }

  const usagePercent =
    contextLimit && contextLimit > 0
      ? `${Math.min(100, Math.round((totalTokens / contextLimit) * 100))}%`
      : '-';

  return ok({
    sessionTitle: session.title ?? 'New conversation',
    providerLabel,
    modelLabel,
    contextLimit,
    messagesCount: sessionMessages.length,
    usagePercent,
    totalTokens,
    currentSessionTokens,
    childSessionsTokens,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    userMessageCount,
    assistantMessageCount,
    totalCostUsd: currentSessionCostUsd + childSessionsCostUsd,
    currentSessionCostUsd,
    childSessionsCostUsd,
    sessionCreatedAt: session.createdAt,
    lastActivityAt: session.updatedAt,
  });
}
