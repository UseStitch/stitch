import { streamText } from 'ai';
import { eq, asc } from 'drizzle-orm';

import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';
import { createMessageId, createPartId } from '@stitch/shared/id';
import type { ProviderId } from '@stitch/shared/providers/types';

import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import * as Events from '@/lib/events.js';
import * as Log from '@/lib/log.js';
import { isServiceError } from '@/lib/service-result.js';
import { addCacheControlToMessages, getProviderOptions } from '@/llm/cache-control.js';
import { buildHistoryMessages } from '@/llm/history-messages.js';
import * as Models from '@/llm/provider/models.js';
import * as OllamaModels from '@/llm/provider/ollama-models.js';
import { createProvider } from '@/llm/provider/provider.js';
import type { ProviderCredentials } from '@/llm/provider/provider.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { mapAIError, toStreamErrorDetails } from '@/llm/stream/ai-error-mapper.js';
import { getSessionToolsetState } from '@/llm/stream/session-toolsets.js';
import { retrieveMemoryContext } from '@/memory/retriever.js';
import { getSettings } from '@/settings/service.js';
import { getSessionTodosPromptBlock } from '@/todos/service.js';
import { getToolset } from '@/tools/toolsets/registry.js';
import { recordLlmUsage } from '@/usage/ledger.js';
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

type StoredMessage = typeof messages.$inferSelect;

export async function getCompactionSettings(): Promise<CompactionSettings> {
  const s = await getSettings([
    'compaction.auto',
    'compaction.prune',
    'compaction.reserved',
  ] as const);
  return {
    auto: s['compaction.auto'],
    prune: s['compaction.prune'],
    reserved: s['compaction.reserved'],
  };
}

async function getPromptUserContext(): Promise<{
  userName: string | null;
  userTimezone: string | null;
}> {
  const s = await getSettings(['profile.name', 'profile.timezone'] as const);
  return {
    userName: s['profile.name'] || null,
    userTimezone: s['profile.timezone'] || null,
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
async function prune(msgs: StoredMessage[]): Promise<number> {
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

    const msgById = new Map(msgs.map((m) => [m.id, m]));
    const db = getDb();
    const now = Date.now();

    await db.transaction(async (tx) => {
      await Promise.all(
        Array.from(grouped.entries()).map(async ([messageId, partIndices]) => {
          const msg = msgById.get(messageId);
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

          await tx
            .update(messages)
            .set({ parts: updatedParts, updatedAt: now })
            .where(eq(messages.id, messageId));
        }),
      );
    });

    log.info({ count: toPrune.length }, 'pruned');
  }

  return pruned;
}

const COMPACTION_PROMPT = `Provide a detailed prompt for continuing our conversation above.
Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next.
The summary that you construct will be used so a future run can continue the work.

Use the following markdown sections in your response. Do not wrap your response in a code block.

## Goal

[What goal(s) is the user trying to accomplish?]

## Instructions

- [What important instructions did the user give you that are relevant]
- [If there is a plan or spec, include information about it so the next run can continue using it]

## Discoveries

[What notable things were learned during this conversation that would be useful when continuing the work]

## Accomplished

[What work has been completed, what work is still in progress, and what work is left?]

If the system prompt includes a <todos> block, preserve those current todo items in this section.

## Relevant files / directories

[Construct a structured list of relevant files that have been read, edited, or created that pertain to the task at hand. If all the files in a directory are relevant, include the path to the directory.]

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
  compactionSettings?: CompactionSettings;
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

    const [compactionSettings, promptUserContext, resolved, todoContext] = await Promise.all([
      input.compactionSettings ?? getCompactionSettings(),
      getPromptUserContext(),
      resolveCompactionModel(input.providerId, input.modelId),
      getSessionTodosPromptBlock(sessionId),
    ]);

    Events.emit('compaction-start', { sessionId, messageId: summaryMessageId });

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

    await db.insert(messages).values({
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

    const allMsgs = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt));

    if (compactionSettings.prune) {
      log.info({ sessionId }, 'pruning');
      await prune(allMsgs);
    }

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

    const historyMessages = buildHistoryMessages(relevantMsgs, {
      useBasePrompt: true,
      systemPrompt: null,
      userName: promptUserContext.userName,
      userTimezone: promptUserContext.userTimezone,
      todoContext,
    });

    const provider = createProvider(resolved.credentials);
    const model = provider(resolved.modelId);

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
    const summaryNow = Date.now();
    const summaryPart: StoredPart = {
      type: 'text-delta',
      id: createPartId(),
      text: summaryText,
      startedAt: summaryNow,
      endedAt: summaryNow,
    } as StoredPart;

    const { costUsd } = await recordLlmUsage({
      runId: summaryMessageId,
      source: 'compaction',
      status: 'succeeded',
      sessionId,
      messageId: summaryMessageId,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      usage,
      metadata: {
        phase: 'compaction',
        auto: input.auto,
        overflow: input.overflow ?? false,
      },
      startedAt: now,
      endedAt: summaryNow,
      durationMs: summaryNow - now,
    });

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

    log.info(
      {
        sessionId,
        summaryTokens: estimate(summaryText),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
      'compaction complete',
    );

    Events.emit('compaction-complete', { sessionId, summaryMessageId });

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

    Events.emit('stream-error', {
      sessionId,
      messageId: summaryMessageId,
      error: `Compaction failed: ${mappedError.message}`,
      details: toStreamErrorDetails(mappedError),
    });

    const failedAt = Date.now();
    await recordLlmUsage({
      runId: summaryMessageId,
      source: 'compaction',
      status: 'failed',
      sessionId,
      messageId: summaryMessageId,
      providerId: input.providerId,
      modelId: input.modelId,
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
    codeModePrompt?: string | null;
  },
): Promise<ModelMessage[]> {
  const db = getDb();

  const [msgs, promptUserContext, sessionRow, todoContext] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt)),
    promptConfig?.userName !== undefined && promptConfig?.userTimezone !== undefined
      ? Promise.resolve({
          userName: promptConfig.userName ?? null,
          userTimezone: promptConfig.userTimezone ?? null,
        })
      : getPromptUserContext(),
    db.select({ type: sessions.type }).from(sessions).where(eq(sessions.id, sessionId)).limit(1),
    getSessionTodosPromptBlock(sessionId),
  ]);

  // Automations can read all memories; chat only sees 'chat' memories
  const memorySourceFilter = sessionRow[0]?.type === 'automation' ? undefined : ('chat' as const);

  // Find the last compaction boundary (summary message)
  let startIndex = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].isSummary) {
      startIndex = i;
      break;
    }
  }

  // Extract the latest user message text for memory retrieval
  let memoryContext: string | null = null;
  const latestUserMsg = [...msgs].reverse().find((m) => m.role === 'user');
  if (latestUserMsg) {
    const userText = latestUserMsg.parts
      .filter((p): p is StoredPart & { type: 'text-delta' } => p.type === 'text-delta')
      .map((p) => p.text)
      .join('');

    if (userText.length > 0) {
      memoryContext = await retrieveMemoryContext(userText, memorySourceFilter).catch(() => null);
    }
  }

  const historyMessages = buildHistoryMessages(msgs.slice(startIndex), {
    useBasePrompt: promptConfig?.useBasePrompt ?? true,
    systemPrompt: promptConfig?.systemPrompt ?? null,
    userName: promptUserContext.userName,
    userTimezone: promptUserContext.userTimezone,
    memoryContext,
    todoContext,
    codeModePrompt: promptConfig?.codeModePrompt ?? null,
  });

  const instructionsBlock = buildActiveToolsetInstructionsBlock(sessionId);
  if (instructionsBlock && historyMessages.length > 0 && historyMessages[0]?.role === 'system') {
    const sysMsg = historyMessages[0];
    const existing = typeof sysMsg.content === 'string' ? sysMsg.content : '';
    historyMessages[0] = { role: 'system', content: `${existing}${instructionsBlock}` };
  }

  return historyMessages;
}

export function buildActiveToolsetInstructionsBlock(sessionId: PrefixedString<'ses'>): string {
  const activeIds = getSessionToolsetState(sessionId).active.map((entry) => entry.id);
  const instructionBlocks = activeIds
    .map((id) => getToolset(id))
    .filter((ts): ts is NonNullable<ReturnType<typeof getToolset>> => !!ts?.instructions)
    .map((ts) => `### ${ts.name} Toolset Instructions\n${ts.instructions}`)
    .join('\n\n');

  return instructionBlocks ? `\n\n## Active Toolset Instructions\n\n${instructionBlocks}` : '';
}

/**
 * Look up model limits for a given provider/model combination.
 */
export async function getModelLimits(providerId: string, modelId: string): Promise<ModelLimits> {
  if (providerId === 'ollama_local') {
    const result = await OllamaModels.getOllamaModel(modelId);
    if (!isServiceError(result)) {
      return { context: result.data.contextWindow, output: result.data.outputLimit };
    }
    return { context: 200_000, output: 8_192 };
  }

  const providers = await Models.get();
  const provider = providers[providerId];
  const model = provider?.models[modelId];
  return model?.limit ?? { context: 200_000, output: 8_192 };
}
