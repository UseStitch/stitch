import { and, asc, desc, eq, gte, inArray, isNull, like, lt } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import fs from 'node:fs/promises';
import path from 'node:path';

import { ARCHIVE_REASONS } from '@stitch/shared/chat/messages';
import type { StoredPart, SessionStats } from '@stitch/shared/chat/messages';
import { createMessageId, createPartId, createSessionId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import { isLocalProviderId } from '@stitch/shared/providers/types';

import { cancelBackgroundTasksForParent } from '@/background-tasks/service.js';
import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { buildSessionLlmMessages } from '@/llm/session-history.js';
import { compact } from '@/llm/session-summary.js';
import { resolveDecision, type DoomLoopResponse } from '@/llm/stream/doom-loop.js';
import { runStream } from '@/llm/stream/runner.js';
import { abortSessionInteractions } from '@/llm/stream/session-abort.js';
import { abortSession, enqueueSessionRun } from '@/llm/stream/session-run-coordinator.js';
import * as LocalModels from '@/models/llm/local.js';
import * as Models from '@/models/llm/registry.js';
import {
  getProviderCredentials,
  isLlmProviderCredentials,
  listProvidersWithCapabilities,
  type LlmProviderCredentials,
} from '@/provider/service.js';
import { normalizeUsage } from '@/utils/usage.js';

const log = Log.create({ service: 'chat-service' });

type SendMessageInput = {
  sessionId: PrefixedString<'ses'>;
  content: string;
  attachments?: Array<{ path: string; mime: string; filename: string }>;
  providerId: string;
  modelId: string;
  assistantMessageId: PrefixedString<'msg'>;
};

type RedoMessageInput = SendMessageInput & { editedMessageId: PrefixedString<'msg'> };

type TurnSession = typeof sessions.$inferSelect;
type LlmTurnConfig = { credentials: LlmProviderCredentials };

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

function buildChatTitleContent(firstMessage: string, filenames: string[] = []): string {
  const normalizedFilenames = filenames.map((name) => name.trim()).filter(Boolean);
  const filenameContext =
    normalizedFilenames.length > 0
      ? `\nAttached filenames:\n${normalizedFilenames.map((name) => `- ${name}`).join('\n')}`
      : '';

  return `
Generate a short, descriptive title (30 chars max) for a conversation.
If attached filenames are provided, prefer using them when they add useful context.

First message:
"${firstMessage}"${filenameContext}

Return only the title.
`;
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

  internalBus.emit('title.generation.chat.requested', {
    sessionId: input.sessionId,
    content: buildChatTitleContent(input.userText, input.attachmentFilenames),
    fallbackProviderId: input.providerId,
    fallbackModelId: input.modelId,
  });
}

async function loadTurnContext(
  sessionId: PrefixedString<'ses'>,
  providerId: string,
): Promise<{ session: TurnSession; config: LlmTurnConfig }> {
  const db = getDb();

  const session = (await db.select().from(sessions).where(eq(sessions.id, sessionId))).at(0);
  if (!session) {
    throw new HTTPException(404, { message: 'Session not found' });
  }

  let credentials: LlmProviderCredentials;
  try {
    const rawCredentials = await getProviderCredentials(providerId);
    if (!isLlmProviderCredentials(rawCredentials)) {
      throw new HTTPException(400, { message: `Provider "${providerId}" is not configured for LLM usage` });
    }
    credentials = rawCredentials;
  } catch (err) {
    if (err instanceof HTTPException && err.status === 400) throw err;
    throw new HTTPException(400, { message: `Provider "${providerId}" is not configured` });
  }

  return { session, config: { credentials } };
}

function runTurn(input: {
  sessionId: PrefixedString<'ses'>;
  assistantMessageId: PrefixedString<'msg'>;
  session: TurnSession;
  config: LlmTurnConfig;
  modelId: string;
}): void {
  const isChildSession = input.session.parentSessionId !== null;

  void enqueueSessionRun(input.sessionId, async (abortSignal) => {
    const llmMessages = await buildSessionLlmMessages(input.sessionId, { useBasePrompt: true, systemPrompt: null });
    await runStream({
      sessionId: input.sessionId,
      assistantMessageId: input.assistantMessageId,
      modelId: input.modelId,
      llmMessages,
      credentials: input.config.credentials,
      abortSignal,
      allowTaskTool: !isChildSession,
      excludedToolsetIds: isChildSession ? ['browser'] : undefined,
    });
  }).catch((error) => {
    log.error(
      { event: 'stream.failed', sessionId: input.sessionId, messageId: input.assistantMessageId, error },
      'stream run failed',
    );
  });
}

export async function sendMessage(
  input: SendMessageInput,
): Promise<{ messageId: PrefixedString<'msg'>; userMessageId: PrefixedString<'msg'> }> {
  const db = getDb();

  const context = await loadTurnContext(input.sessionId, input.providerId);

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

  runTurn({
    sessionId: input.sessionId,
    assistantMessageId: input.assistantMessageId,
    session: context.session,
    config: context.config,
    modelId: input.modelId,
  });

  return { messageId: input.assistantMessageId, userMessageId };
}

export async function redoMessage(
  input: RedoMessageInput,
): Promise<{ messageId: PrefixedString<'msg'>; userMessageId: PrefixedString<'msg'> }> {
  const db = getDb();

  const context = await loadTurnContext(input.sessionId, input.providerId);

  const editedMessage = (
    await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.id, input.editedMessageId),
          eq(messages.sessionId, input.sessionId),
          isNull(messages.archivedAt),
        ),
      )
  ).at(0);
  if (!editedMessage) throw new HTTPException(404, { message: 'Message not found' });
  if (editedMessage.role !== 'user') throw new HTTPException(400, { message: 'Can only redo from user messages' });

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

  runTurn({
    sessionId: input.sessionId,
    assistantMessageId: input.assistantMessageId,
    session: context.session,
    config: context.config,
    modelId: input.modelId,
  });

  return { messageId: input.assistantMessageId, userMessageId };
}

export function resolveDoomLoop(sessionId: PrefixedString<'ses'>, response: DoomLoopResponse): { ok: true } {
  const resolved = resolveDecision(sessionId, response);
  if (!resolved) {
    throw new HTTPException(404, { message: 'No pending doom loop prompt for this session' });
  }

  return { ok: true };
}

export async function abortSessionRun(sessionId: PrefixedString<'ses'>): Promise<void> {
  log.info({ event: 'stream.abort.requested', sessionId }, 'stream abort requested');
  abortSession(sessionId);

  const db = getDb();
  const childSessions = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.parentSessionId, sessionId));

  await Promise.all([
    cancelBackgroundTasksForParent(sessionId),
    abortSessionInteractions(sessionId),
    ...childSessions.map((child) => abortSessionInteractions(child.id)),
  ]);
}

function parseSplitTitle(title: string): { base: string; n: number } | null {
  const match = title.match(/^(.+) Split #(\d+)$/);
  if (!match) return null;
  return { base: match[1], n: parseInt(match[2], 10) };
}

export async function splitSession(
  sessionId: PrefixedString<'ses'>,
  msgId: PrefixedString<'msg'>,
): Promise<{ session: typeof sessions.$inferSelect; prefillText: string }> {
  const db = getDb();

  const session = (await db.select().from(sessions).where(eq(sessions.id, sessionId))).at(0);
  if (!session) throw new HTTPException(404, { message: 'Session not found' });

  const splitMsg = (
    await db
      .select()
      .from(messages)
      .where(and(eq(messages.id, msgId), eq(messages.sessionId, sessionId), isNull(messages.archivedAt)))
  ).at(0);
  if (!splitMsg) throw new HTTPException(404, { message: 'Message not found' });
  if (splitMsg.role !== 'user') throw new HTTPException(400, { message: 'Can only split from user messages' });

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

  const newTitle = `${lookupBase} Split #${maxN + 1}`;
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

  return { session: newSession, prefillText };
}

export async function requestCompaction(sessionId: PrefixedString<'ses'>): Promise<{ ok: true }> {
  const db = getDb();

  const session = (await db.select().from(sessions).where(eq(sessions.id, sessionId))).at(0);
  if (!session) {
    throw new HTTPException(404, { message: 'Session not found' });
  }

  const lastMessage = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(desc(messages.createdAt))
    .limit(1)
    .then((rows) => rows.at(0));

  if (!lastMessage) {
    throw new HTTPException(400, { message: 'Session has no messages to compact' });
  }

  void compact({ sessionId, providerId: lastMessage.providerId, modelId: lastMessage.modelId, auto: false });

  return { ok: true };
}

export async function getSessionStats(sessionId: PrefixedString<'ses'>): Promise<SessionStats> {
  const db = getDb();

  const getMessageTokens = (usage: (typeof messages.$inferSelect)['usage']): number =>
    normalizeUsage(usage).totalTokens;

  const session = (await db.select().from(sessions).where(eq(sessions.id, sessionId))).at(0);
  if (!session) {
    throw new HTTPException(404, { message: 'Session not found' });
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

  const currentSessionCostUsd = sessionMessages.reduce((acc, m) => acc + m.costUsd, 0);
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

    childSessionsCostUsd = childMsgs.reduce((acc, m) => acc + m.costUsd, 0);
    childSessionsTokens = childMsgs.reduce((acc, m) => acc + getMessageTokens(m.usage), 0);
  }

  // Find the latest assistant message with token usage (for context window stats)
  const latestAssistantWithTokens = sessionMessages.findLast((message) => {
    const isAssistantMessage = message.role === 'assistant';
    const isSessionTitleMessage = message.parts.some((part) => part.type === 'session-title');
    const hasTokenUsage = normalizeUsage(message.usage).totalTokens > 0;
    return isAssistantMessage && !isSessionTitleMessage && hasTokenUsage;
  });

  const latestUsage = normalizeUsage(latestAssistantWithTokens?.usage);
  const totalTokens = latestUsage.totalTokens;

  // Resolve provider/model labels and context limit
  // Find the latest real assistant message (skip background tasks like title generation, compaction, automation)
  const BACKGROUND_PART_TYPES: Set<StoredPart['type']> = new Set([
    'session-title',
    'compaction',
    'automation-generation',
  ]);
  const latestRealMessage = sessionMessages.findLast((message) => {
    const isAssistantMessage = message.role === 'assistant';
    const isBackgroundMessage = message.parts.some((part) => BACKGROUND_PART_TYPES.has(part.type));
    return isAssistantMessage && !isBackgroundMessage;
  });

  const [providers, modelCatalog] = await Promise.all([listProvidersWithCapabilities(), Models.get()]);

  let providerLabel = '-';
  let modelLabel = '-';
  let contextLimit: number | null = null;

  if (latestRealMessage) {
    const provider = providers.find((p) => p.id === latestRealMessage.providerId);
    providerLabel = provider?.name ?? latestRealMessage.providerId;

    if (isLocalProviderId(latestRealMessage.providerId)) {
      const localModel = await LocalModels.getLocalModel(latestRealMessage.providerId, latestRealMessage.modelId).catch(
        () => null,
      );
      modelLabel = localModel ? localModel.name : latestRealMessage.modelId;
    } else {
      const providerModels = modelCatalog[latestRealMessage.providerId];
      const model = providerModels.models[latestRealMessage.modelId];
      modelLabel = model.name;
    }
  }

  if (latestAssistantWithTokens) {
    if (isLocalProviderId(latestAssistantWithTokens.providerId)) {
      const localModel = await LocalModels.getLocalModel(
        latestAssistantWithTokens.providerId,
        latestAssistantWithTokens.modelId,
      ).catch(() => null);
      contextLimit = localModel ? localModel.contextWindow : null;
    } else {
      const providerModels = modelCatalog[latestAssistantWithTokens.providerId];
      const model = providerModels.models[latestAssistantWithTokens.modelId];
      contextLimit = model.limit.context;
    }
  }

  const usagePercent =
    contextLimit && contextLimit > 0 ? `${Math.min(100, Math.round((totalTokens / contextLimit) * 100))}%` : '-';

  return {
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
  };
}
