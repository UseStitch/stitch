import { and, asc, desc, eq, gte, inArray, isNull, like, lt } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

import { ARCHIVE_REASONS } from '@stitch/shared/chat/messages';
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
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { buildSessionLlmMessages } from '@/llm/session-history.js';
import { compact } from '@/llm/session-summary.js';
import { cancelDecision, resolveDecision, type DoomLoopResponse } from '@/llm/stream/doom-loop.js';
import { runStream } from '@/llm/stream/runner.js';
import { generateTitle } from '@/llm/title-generator.js';
import * as Models from '@/models/llm/registry.js';
import { abortPermissionResponses } from '@/permission/service.js';
import { isLlmProviderCredentials } from '@/provider/config/schema.js';
import { listProvidersWithCapabilities, type ProviderWithCapabilities } from '@/provider/service.js';
import { abortQuestions } from '@/question/service.js';
import { recordLlmUsage } from '@/usage/ledger.js';
import { normalizeUsage } from '@/utils/usage.js';

const log = Log.create({ service: 'chat-service' });

type SendMessageInput = {
  sessionId: PrefixedString<'ses'>;
  content: string;
  attachments?: Array<{ path: string; mime: string; filename: string }>;
  providerId: string;
  modelId: string;
  assistantMessageId: string;
};

type RedoMessageInput = SendMessageInput & { editedMessageId: PrefixedString<'msg'> };

async function buildUserMessageParts(input: {
  content: string;
  attachments?: Array<{ path: string; mime: string; filename: string }>;
  existingAttachmentParts?: StoredPart[];
  now: number;
}): Promise<StoredPart[]> {
  const userPart: StoredPart = {
    type: 'text-delta',
    id: createPartId(),
    text: input.content,
    startedAt: input.now,
    endedAt: input.now,
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
          startedAt: input.now,
          endedAt: input.now,
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
          startedAt: input.now,
          endedAt: input.now,
        };
      }

      return {
        type: 'user-text-file' as const,
        id: createPartId(),
        content: fileBuffer.toString('utf8'),
        mime: att.mime,
        filename: att.filename,
        startedAt: input.now,
        endedAt: input.now,
      };
    }),
  );

  return [userPart, ...(input.existingAttachmentParts ?? []), ...attachmentParts];
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
        metadata: { phase: 'title-generation' },
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

      internalBus.emit('session.title.updated', { sessionId: input.sessionId, title: generatedTitle.title });
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

  const [config] = await db.select().from(providerConfig).where(eq(providerConfig.providerId, input.providerId));
  if (!config) {
    return err(`Provider "${input.providerId}" is not configured`, 400);
  }

  if (config.credentials.providerId !== input.providerId || !isLlmProviderCredentials(config.credentials)) {
    return err(`Provider "${input.providerId}" is not configured for LLM usage`, 400);
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
  const userParts = await buildUserMessageParts({ content: input.content, attachments: input.attachments, now });

  await db
    .insert(messages)
    .values({
      id: userMessageId,
      sessionId: input.sessionId,
      role: 'user',
      parts: userParts,
      modelId: input.modelId,
      providerId: input.providerId,
      costUsd: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      duration: null,
    });

  await db.update(sessions).set({ updatedAt: Date.now() }).where(eq(sessions.id, input.sessionId));

  const llmMessages = await buildSessionLlmMessages(input.sessionId, { useBasePrompt: true, systemPrompt: null });
  const assistantMessageId = input.assistantMessageId as PrefixedString<'msg'>;
  const abortSignal = AbortRegistry.register(input.sessionId);

  const isChildSession = session.parentSessionId !== null;

  void runStream({
    sessionId: input.sessionId,
    assistantMessageId,
    modelId: input.modelId,
    llmMessages,
    credentials: config.credentials,
    abortSignal,
    allowTaskTool: !isChildSession,
    excludedToolsetIds: isChildSession ? ['browser'] : undefined,
  })
    .catch((error) => {
      log.error(
        { event: 'stream.failed', sessionId: input.sessionId, messageId: assistantMessageId, error },
        'stream run failed',
      );
    })
    .finally(() => {
      AbortRegistry.cleanup(input.sessionId);
    });

  return ok({ messageId: assistantMessageId, userMessageId });
}

export async function redoMessage(
  input: RedoMessageInput,
): Promise<ServiceResult<{ messageId: string; userMessageId: string }>> {
  const db = getDb();

  const [session] = await db.select().from(sessions).where(eq(sessions.id, input.sessionId));
  if (!session) {
    return err('Session not found', 404);
  }

  const [config] = await db.select().from(providerConfig).where(eq(providerConfig.providerId, input.providerId));
  if (!config) {
    return err(`Provider "${input.providerId}" is not configured`, 400);
  }

  if (config.credentials.providerId !== input.providerId || !isLlmProviderCredentials(config.credentials)) {
    return err(`Provider "${input.providerId}" is not configured for LLM usage`, 400);
  }

  const [editedMessage] = await db
    .select()
    .from(messages)
    .where(
      and(eq(messages.id, input.editedMessageId), eq(messages.sessionId, input.sessionId), isNull(messages.archivedAt)),
    );
  if (!editedMessage) return err('Message not found', 404);
  if (editedMessage.role !== 'user') return err('Can only redo from user messages', 400);

  const now = Date.now();
  const userMessageId = createMessageId();
  const existingAttachmentParts = editedMessage.parts.filter((part) => part.type !== 'text-delta');
  const userParts = await buildUserMessageParts({
    content: input.content,
    attachments: input.attachments,
    existingAttachmentParts,
    now,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(messages)
      .set({ archivedAt: now, archivedReason: ARCHIVE_REASONS.redo, updatedAt: now })
      .where(
        and(
          eq(messages.sessionId, input.sessionId),
          gte(messages.createdAt, editedMessage.createdAt),
          isNull(messages.archivedAt),
        ),
      );

    await tx
      .insert(messages)
      .values({
        id: userMessageId,
        sessionId: input.sessionId,
        role: 'user',
        parts: userParts,
        modelId: input.modelId,
        providerId: input.providerId,
        costUsd: 0,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        duration: null,
      });

    await tx.update(sessions).set({ updatedAt: now }).where(eq(sessions.id, input.sessionId));
  });

  const llmMessages = await buildSessionLlmMessages(input.sessionId, { useBasePrompt: true, systemPrompt: null });
  const assistantMessageId = input.assistantMessageId as PrefixedString<'msg'>;
  const abortSignal = AbortRegistry.register(input.sessionId);

  const isChildSession = session.parentSessionId !== null;

  void runStream({
    sessionId: input.sessionId,
    assistantMessageId,
    modelId: input.modelId,
    llmMessages,
    credentials: config.credentials,
    abortSignal,
    allowTaskTool: !isChildSession,
    excludedToolsetIds: isChildSession ? ['browser'] : undefined,
  })
    .catch((error) => {
      log.error(
        { event: 'stream.failed', sessionId: input.sessionId, messageId: assistantMessageId, error },
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

export async function abortSessionRun(sessionId: PrefixedString<'ses'>): Promise<ServiceResult<null>> {
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

  return ok(null);
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

  const [splitMsg] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, msgId), eq(messages.sessionId, sessionId), isNull(messages.archivedAt)));
  if (!splitMsg) return err('Message not found', 404);
  if (splitMsg.role !== 'user') return err('Can only split from user messages', 400);

  const priorMessages = await db
    .select()
    .from(messages)
    .where(
      and(eq(messages.sessionId, sessionId), lt(messages.createdAt, splitMsg.createdAt), isNull(messages.archivedAt)),
    )
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
    .values({ id: newSessionId, title: newTitle, parentSessionId: null, createdAt: now, updatedAt: now })
    .returning();

  if (priorMessages.length > 0) {
    await db
      .insert(messages)
      .values(
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
    .orderBy(desc(messages.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  if (!lastMessage) {
    return err('Session has no messages to compact', 400);
  }

  void compact({ sessionId, providerId: lastMessage.providerId, modelId: lastMessage.modelId, auto: false });

  return ok({ ok: true });
}

export async function getSessionStats(sessionId: PrefixedString<'ses'>): Promise<ServiceResult<SessionStats>> {
  const db = getDb();

  const getMessageTokens = (usage: (typeof messages.$inferSelect)['usage']): number =>
    normalizeUsage(usage).totalTokens;

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
      .where(and(eq(messages.sessionId, sessionId), isNull(messages.archivedAt)))
      .orderBy(asc(messages.createdAt)),
    db.select({ id: sessions.id }).from(sessions).where(eq(sessions.parentSessionId, sessionId)),
  ]);

  const currentSessionCostUsd = sessionMessages.reduce((acc, m) => acc + (m.costUsd ?? 0), 0);
  const currentSessionTokens = sessionMessages.reduce((acc, m) => acc + getMessageTokens(m.usage), 0);
  const userMessageCount = sessionMessages.filter((m) => m.role === 'user').length;
  const assistantMessageCount = sessionMessages.filter((m) => m.role === 'assistant').length;

  let childSessionsCostUsd = 0;
  let childSessionsTokens = 0;
  if (childSessions.length > 0) {
    const childIds = childSessions.map((c) => c.id);
    const childMsgs = await db
      .select({ costUsd: messages.costUsd, usage: messages.usage })
      .from(messages)
      .where(and(inArray(messages.sessionId, childIds), isNull(messages.archivedAt)));

    childSessionsCostUsd = childMsgs.reduce((acc, m) => acc + (m.costUsd ?? 0), 0);
    childSessionsTokens = childMsgs.reduce((acc, m) => acc + getMessageTokens(m.usage), 0);
  }

  // Find the latest assistant message with token usage (for context window stats)
  let latestAssistantWithTokens: (typeof sessionMessages)[number] | null = null;
  for (let i = sessionMessages.length - 1; i >= 0; i--) {
    const msg = sessionMessages[i];
    if (!msg || msg.role !== 'assistant') continue;
    if (msg.parts?.some((p) => p.type === 'session-title')) continue;
    const tokenSum = normalizeUsage(msg.usage).totalTokens;
    if (tokenSum > 0) {
      latestAssistantWithTokens = msg;
      break;
    }
  }

  const latestUsage = normalizeUsage(latestAssistantWithTokens?.usage);
  const totalTokens = latestUsage.totalTokens;

  // Resolve provider/model labels and context limit
  const latestMessage = sessionMessages.length > 0 ? sessionMessages[sessionMessages.length - 1] : null;
  const [providersResult, modelCatalog] = await Promise.all([listProvidersWithCapabilities(), Models.get()]);
  const providers: ProviderWithCapabilities[] = providersResult.error ? [] : providersResult.data;

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
    contextLimit && contextLimit > 0 ? `${Math.min(100, Math.round((totalTokens / contextLimit) * 100))}%` : '-';

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
    inputTokens: latestUsage.inputTokens,
    outputTokens: latestUsage.outputTokens,
    reasoningTokens: latestUsage.reasoningTokens,
    cacheReadTokens: latestUsage.cacheReadTokens,
    cacheWriteTokens: latestUsage.cacheWriteTokens,
    userMessageCount,
    assistantMessageCount,
    totalCostUsd: currentSessionCostUsd + childSessionsCostUsd,
    currentSessionCostUsd,
    childSessionsCostUsd,
    sessionCreatedAt: session.createdAt,
    lastActivityAt: session.updatedAt,
  });
}
