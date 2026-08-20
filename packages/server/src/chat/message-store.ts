import { eq } from 'drizzle-orm';

import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { internalBus } from '@/lib/internal-bus.js';
import { calculateMessageCostUsd } from '@/usage/cost.js';
import type { LanguageModelUsage } from 'ai';

type SaveAssistantMessageOpts = {
  sessionId: PrefixedString<'ses'>;
  assistantMessageId: PrefixedString<'msg'>;
  modelId: string;
  providerId: string;
  accumulatedParts: StoredPart[];
  totalUsage: LanguageModelUsage;
  finalFinishReason: string;
  startedAt: number;
};

type SaveTitleMessageOpts = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  modelId: string;
  providerId: string;
  parts: StoredPart[];
  usage: LanguageModelUsage | undefined;
  costUsd: number;
  createdAt: number;
};

export async function saveAssistantMessage(opts: SaveAssistantMessageOpts): Promise<void> {
  const finishedAt = Date.now();
  const db = getDb();
  const costUsd = await calculateMessageCostUsd({
    providerId: opts.providerId,
    modelId: opts.modelId,
    usage: opts.totalUsage,
  });
  const set = {
    parts: opts.accumulatedParts,
    usage: opts.totalUsage,
    costUsd,
    finishReason: opts.finalFinishReason,
    startedAt: opts.startedAt,
    duration: finishedAt - opts.startedAt,
  };

  await db
    .insert(messages)
    .values({
      id: opts.assistantMessageId,
      sessionId: opts.sessionId,
      role: 'assistant',
      modelId: opts.modelId,
      providerId: opts.providerId,
      createdAt: opts.startedAt,
      ...set,
    })
    .onConflictDoUpdate({ target: messages.id, set: { ...set, updatedAt: finishedAt } });

  internalBus.emit('session.message.saved', {
    sessionId: opts.sessionId,
    messageId: opts.assistantMessageId,
    modelId: opts.modelId,
    providerId: opts.providerId,
    usage: opts.totalUsage,
    costUsd,
    finishReason: opts.finalFinishReason,
  });
}

export async function markSessionUnread(sessionId: PrefixedString<'ses'>): Promise<void> {
  const db = getDb();
  await db.update(sessions).set({ isUnread: true, updatedAt: Date.now() }).where(eq(sessions.id, sessionId));
}

export async function saveTitleMessage(opts: SaveTitleMessageOpts): Promise<void> {
  const { sessionId, messageId, modelId, providerId, parts, usage, costUsd, createdAt } = opts;
  const db = getDb();

  await db
    .insert(messages)
    .values({
      id: messageId,
      sessionId,
      role: 'assistant',
      parts,
      modelId,
      providerId,
      usage,
      costUsd,
      finishReason: 'stop',
      isSummary: false,
      createdAt,
      updatedAt: createdAt,
      startedAt: createdAt,
      duration: 0,
    });
}
