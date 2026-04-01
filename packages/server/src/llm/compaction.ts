import { streamText } from 'ai';
import { eq, asc, like, inArray } from 'drizzle-orm';

import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';
import { createMessageId, createPartId } from '@stitch/shared/id';
import type { ProviderId } from '@stitch/shared/providers/types';

import { getDb } from '@/db/client.js';
import { messages, sessions, userSettings } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import * as Sse from '@/lib/sse.js';
import { addCacheControlToMessages, getProviderOptions } from '@/llm/cache-control.js';
import { buildHistoryMessages } from '@/llm/history-messages.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { mapAIError, toStreamErrorDetails } from '@/llm/stream/ai-error-mapper.js';
import * as Models from '@/provider/models.js';
import { createProvider } from '@/provider/provider.js';
import type { ProviderCredentials } from '@/provider/provider.js';
import { recordUsageEvent } from '@/usage/ledger.js';
import { calculateMessageCostUsd } from '@/utils/cost.js';
import { estimate } from '@/utils/token.js';
import type { ModelMessage, LanguageModelUsage } from 'ai';

const log = Log.create({ service: 'compaction' });

const COMPACTION_BUFFER = 20_000;
const OUTPUT_TOKEN_MAX = 32_000;
const PRUNE_PROTECT = 40_000;
const PRUNE_MINIMUM = 20_000;

type ModelLimits = { context: number; input?: number; output: number };

type CompactionSettings = {
  auto: boolean;
  prune: boolean;
  reserved?: number;
};

function parseBooleanSetting(value: string | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseReservedSetting(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

export async function getCompactionSettings(): Promise<CompactionSettings> {
  const db = getDb();
  const rows = await db.select().from(userSettings).where(like(userSettings.key, 'compaction.%'));
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    auto: parseBooleanSetting(byKey.get('compaction.auto')) ?? true,
    prune: parseBooleanSetting(byKey.get('compaction.prune')) ?? true,
    reserved: parseReservedSetting(byKey.get('compaction.reserved')),
  };
}

async function getPromptUserContext(): Promise<{ userName: string | null; userTimezone: string | null }> {
  const db = getDb();
  const rows = await db
    .select({ key: userSettings.key, value: userSettings.value })
    .from(userSettings)
    .where(inArray(userSettings.key, ['profile.name', 'profile.timezone']));
  const byKey = new Map(rows.map((row) => [row.key, row.value.trim()]));

  return {
    userName: byKey.get('profile.name') || null,
    userTimezone: byKey.get('profile.timezone') || null,
  };
}

export function isOverflow(
  usage: LanguageModelUsage,
  limits: ModelLimits,
  settings?: { reserved?: number },
): boolean {
  if (limits.context === 0) return false;

  const count =
    usage.totalTokens ??
    (usage.inputTokens ?? 0) +
      (usage.outputTokens ?? 0) +
      (usage.inputTokenDetails?.cacheReadTokens ?? 0) +
      (usage.inputTokenDetails?.cacheWriteTokens ?? 0);

  const maxOutput = Math.min(limits.output, OUTPUT_TOKEN_MAX) || OUTPUT_TOKEN_MAX;
  const reserved = settings?.reserved ?? Math.min(COMPACTION_BUFFER, maxOutput);
  const usable = limits.input ? limits.input - reserved : limits.context - maxOutput;

  return count >= usable;
}

/**
 * Walk backwards through message parts, clearing old tool-result outputs
 * that exceed the PRUNE_PROTECT token threshold. This reclaims context
 * space without a full compaction summary.
 */
async function prune(sessionId: PrefixedString<'ses'>): Promise<number> {
  log.info({ sessionId }, 'pruning');

  const db = getDb();
  const now = Date.now();
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  let total = 0;
  let pruned = 0;
  const toPrune: Array<{ messageId: PrefixedString<'msg'>; partIndex: number }> = [];
  let turns = 0;

  outer: for (let msgIndex = msgs.length - 1; msgIndex >= 0; msgIndex--) {
    const msg = msgs[msgIndex];
    if (msg.role === 'user') turns++;
    if (turns < 2) continue;
    if (msg.role === 'assistant' && msg.isSummary) break outer;

    for (let partIndex = msg.parts.length - 1; partIndex >= 0; partIndex--) {
      const part = msg.parts[partIndex];
      if (part.type === 'tool-result') {
        const est = estimate(part.output);
        total += est;
        if (total > PRUNE_PROTECT) {
          pruned += est;
          toPrune.push({ messageId: msg.id, partIndex });
        }
      }
    }
  }

  log.info({ pruned, total }, 'prune scan');

  if (pruned > PRUNE_MINIMUM) {
    const grouped = new Map<PrefixedString<'msg'>, Array<number>>();
    for (const entry of toPrune) {
      let arr = grouped.get(entry.messageId);
      if (!arr) {
        arr = [];
        grouped.set(entry.messageId, arr);
      }
      arr.push(entry.partIndex);
    }

    await Promise.all(
      Array.from(grouped.entries()).map(async ([messageId, partIndices]) => {
        const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
        if (!msg) return;

        const updatedParts = [...msg.parts];
        for (const partIndex of partIndices) {
          const part = updatedParts[partIndex];
          if (part?.type === 'tool-result') {
            updatedParts[partIndex] = {
              ...part,
              output: '[Old tool result content cleared]',
            } as StoredPart;
          }
        }

        await db
          .update(messages)
          .set({ parts: updatedParts, updatedAt: now })
          .where(eq(messages.id, messageId));
      }),
    );

    log.info({ count: toPrune.length }, 'pruned');
  }

  return pruned;
}

const COMPACTION_PROMPT = `Provide a detailed prompt for continuing our conversation above.
Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next.
The summary that you construct will be used so a future run can continue the work.

When constructing the summary, try to stick to this template:
---
## Goal

[What goal(s) is the user trying to accomplish?]

## Instructions

- [What important instructions did the user give you that are relevant]
- [If there is a plan or spec, include information about it so the next run can continue using it]

## Discoveries

[What notable things were learned during this conversation that would be useful when continuing the work]

## Accomplished

[What work has been completed, what work is still in progress, and what work is left?]

## Relevant files / directories

[Construct a structured list of relevant files that have been read, edited, or created that pertain to the task at hand. If all the files in a directory are relevant, include the path to the directory.]
---

Keep your summary under 1500 words. Prioritize actionable information over completeness.
If the conversation is very long, focus on the most recent work and goals.`;

const COMPACTION_PROMPT_OVERFLOW = `${COMPACTION_PROMPT}

Be very concise. The context window is critically full.
Only include: current goal, active files, and immediate next steps.
Keep under 800 words.`;

type CompactionSeverity = 'normal' | 'overflow';

async function resolveCompactionModel(
  fallbackProviderId: string,
  fallbackModelId: string,
): Promise<{
  providerId: string;
  modelId: string;
  credentials: ProviderCredentials;
  limits: ModelLimits;
}> {
  const resolved = await resolveCheapModel({
    providerIdKey: 'model.compaction.providerId',
    modelIdKey: 'model.compaction.modelId',
    fallbackProviderId,
    fallbackModelId,
  });

  if (!resolved) {
    throw new Error(`No configured provider found for compaction`);
  }

  const providers = await Models.get();
  const provider = providers[resolved.providerId];
  const model = provider?.models[resolved.modelId];
  const limits: ModelLimits = model?.limit ?? { context: 200_000, output: 8_192 };

  return { ...resolved, limits };
}

// Prevent concurrent compaction for the same session
const activeCompactions = new Set<string>();

export async function compact(input: {
  sessionId: PrefixedString<'ses'>;
  providerId: string;
  modelId: string;
  auto: boolean;
  overflow?: boolean;
  severity?: CompactionSeverity;
}): Promise<'continue' | 'error'> {
  const { sessionId } = input;
  const severity: CompactionSeverity = input.severity ?? (input.overflow ? 'overflow' : 'normal');

  if (activeCompactions.has(sessionId)) {
    log.warn({ sessionId }, 'compaction already in progress');
    return 'error';
  }

  activeCompactions.add(sessionId);
  const summaryMessageId = createMessageId();

  try {
    log.info({ sessionId, auto: input.auto }, 'compaction starting');

    const compactionSettings = await getCompactionSettings();

    await Sse.broadcast('compaction-start', { sessionId, messageId: summaryMessageId });

    const db = getDb();
    const now = Date.now();

    const compactionMarkerId = createMessageId();
    const compactionPart: StoredPart = {
      type: 'compaction',
      id: createPartId(),
      auto: input.auto,
      overflow: input.overflow,
      startedAt: now,
      endedAt: now,
    } as StoredPart;

    await db.transaction(async (tx) => {
      await tx.insert(messages).values({
        id: compactionMarkerId,
        sessionId,
        role: 'user',
        parts: [compactionPart],
        modelId: input.modelId,
        providerId: input.providerId,
        costUsd: 0,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        duration: null,
      });

      if (compactionSettings.prune) {
        await prune(sessionId);
      }
    });

    const resolved = await resolveCompactionModel(input.providerId, input.modelId);
    const provider = createProvider(resolved.credentials);
    const model = provider(resolved.modelId);

    const allMsgs = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt));

    const markerIndex = allMsgs.findIndex((m) => m.id === compactionMarkerId);
    const historyMsgs = allMsgs.slice(0, markerIndex);

    let startIndex = 0;
    for (let i = historyMsgs.length - 1; i >= 0; i--) {
      if (historyMsgs[i].isSummary) {
        startIndex = i;
        break;
      }
    }
    const relevantMsgs = historyMsgs.slice(startIndex);

    const promptUserContext = await getPromptUserContext();
    const historyMessages = buildHistoryMessages(relevantMsgs, {
      useBasePrompt: true,
      systemPrompt: null,
      userName: promptUserContext.userName,
      userTimezone: promptUserContext.userTimezone,
    });

    const llmMessages: ModelMessage[] = [
      ...historyMessages,
      {
        role: 'user',
        content: severity === 'overflow' ? COMPACTION_PROMPT_OVERFLOW : COMPACTION_PROMPT,
      },
    ];

    const cachedMessages = addCacheControlToMessages(
      llmMessages,
      resolved.providerId as ProviderId,
      resolved.modelId,
    );
    const providerOptions = getProviderOptions(resolved.providerId as ProviderId, sessionId);

    let summaryText = '';
    const result = streamText({
      model,
      messages: cachedMessages,
      providerOptions,
      maxOutputTokens: severity === 'overflow' ? 2000 : 3000,
    });

    for await (const chunk of result.textStream) {
      summaryText += chunk;
    }

    if (!summaryText.trim()) {
      log.error({ sessionId }, 'compaction produced empty summary');
      await db.delete(messages).where(eq(messages.id, compactionMarkerId));
      return 'error';
    }

    const usage = await result.usage;
    const costUsd = await calculateMessageCostUsd({
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      usage,
    });
    const summaryNow = Date.now();
    const summaryPart: StoredPart = {
      type: 'text-delta',
      id: createPartId(),
      text: summaryText,
      startedAt: summaryNow,
      endedAt: summaryNow,
    } as StoredPart;

    await db.transaction(async (tx) => {
      await tx.insert(messages).values({
        id: summaryMessageId,
        sessionId,
        role: 'assistant',
        parts: [summaryPart],
        modelId: resolved.modelId,
        providerId: resolved.providerId,
        usage,
        costUsd,
        finishReason: 'stop',
        isSummary: true,
        createdAt: summaryNow,
        updatedAt: summaryNow,
        startedAt: summaryNow,
        duration: summaryNow - now,
      });

      await tx.update(sessions).set({ updatedAt: summaryNow }).where(eq(sessions.id, sessionId));
    });

    await recordUsageEvent({
      runId: summaryMessageId,
      source: 'compaction',
      status: 'succeeded',
      sessionId,
      messageId: summaryMessageId,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      usage,
      costUsd,
      metadata: {
        phase: 'compaction',
        auto: input.auto,
        overflow: input.overflow ?? false,
      },
      startedAt: now,
      endedAt: summaryNow,
      durationMs: summaryNow - now,
    });

    log.info(
      {
        sessionId,
        summaryTokens: estimate(summaryText),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
      'compaction complete',
    );

    await Sse.broadcast('compaction-complete', { sessionId, summaryMessageId });
    await Sse.broadcast('data-change', { queryKey: ['sessions', sessionId] });

    return 'continue';
  } catch (error) {
    const mappedError = mapAIError(error, input.providerId);
    log.error(
      {
        sessionId,
        error: mappedError.message,
        errorCategory: mappedError.category,
        aiErrorName: mappedError.aiErrorName,
      },
      'compaction failed',
    );

    await Sse.broadcast('stream-error', {
      sessionId,
      messageId: summaryMessageId,
      error: `Compaction failed: ${mappedError.message}`,
      details: toStreamErrorDetails(mappedError),
    });

    const failedAt = Date.now();
    await recordUsageEvent({
      runId: summaryMessageId,
      source: 'compaction',
      status: 'failed',
      sessionId,
      messageId: summaryMessageId,
      providerId: input.providerId,
      modelId: input.modelId,
      costUsd: 0,
      errorCode: mappedError.category,
      metadata: {
        phase: 'compaction',
        auto: input.auto,
        overflow: input.overflow ?? false,
      },
      startedAt: failedAt,
      endedAt: failedAt,
      durationMs: 0,
    });

    return 'error';
  } finally {
    activeCompactions.delete(sessionId);
  }
}

/**
 * Build the LLM message history for a session, respecting compaction
 * boundaries. Returns messages starting from the most recent summary.
 */
export async function buildCompactedHistory(
  sessionId: PrefixedString<'ses'>,
  promptConfig?: {
    useBasePrompt: boolean;
    systemPrompt: string | null;
    userName?: string | null;
    userTimezone?: string | null;
  },
): Promise<ModelMessage[]> {
  const db = getDb();
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  // Find the last compaction boundary (summary message)
  let startIndex = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].isSummary) {
      startIndex = i;
      break;
    }
  }

  const promptUserContext = await getPromptUserContext();
  return buildHistoryMessages(msgs.slice(startIndex), {
    useBasePrompt: promptConfig?.useBasePrompt ?? true,
    systemPrompt: promptConfig?.systemPrompt ?? null,
    userName: promptConfig?.userName ?? promptUserContext.userName,
    userTimezone: promptConfig?.userTimezone ?? promptUserContext.userTimezone,
  });
}

/**
 * Look up model limits for a given provider/model combination.
 */
export async function getModelLimits(providerId: string, modelId: string): Promise<ModelLimits> {
  const providers = await Models.get();
  const provider = providers[providerId];
  const model = provider?.models[modelId];
  return model?.limit ?? { context: 200_000, output: 8_192 };
}
