import { eq, asc } from 'drizzle-orm';
import { streamText } from 'ai';
import type { ModelMessage, LanguageModelUsage } from 'ai';
import type { PrefixedString, StoredPart } from '@openwork/shared';
import { createMessageId, createPartId } from '@openwork/shared';
import { getDb } from '../db/client.js';
import { messages, sessions } from '../db/schema.js';
import { createProvider } from '../provider/provider.js';
import type { ProviderCredentials } from '../provider/provider.js';
import * as Models from '../provider/models.js';
import * as Log from '../lib/log.js';
import * as Sse from '../lib/sse.js';
import { estimate } from '../utils/token.js';
import { resolveCheapModel } from './resolve-cheap-model.js';

const log = Log.create({ service: 'compaction' });

const COMPACTION_BUFFER = 20_000;
const PRUNE_PROTECT = 40_000;
const PRUNE_MINIMUM = 20_000;

type ModelLimits = { context: number; input?: number; output: number };

export function isOverflow(
  usage: LanguageModelUsage,
  limits: ModelLimits,
): boolean {
  if (limits.context === 0) return false;

  const count = usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  const reserved = Math.min(COMPACTION_BUFFER, limits.output);
  const usable = limits.input
    ? limits.input - reserved
    : limits.context - limits.output;

  return count >= usable;
}

/**
 * Walk backwards through message parts, clearing old tool-result outputs
 * that exceed the PRUNE_PROTECT token threshold. This reclaims context
 * space without a full compaction summary.
 */
async function prune(sessionId: PrefixedString<'ses'>): Promise<number> {
  log.info('pruning', { sessionId });

  const db = getDb();
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  let total = 0;
  let pruned = 0;
  const toPrune: Array<{ messageId: PrefixedString<'msg'>; partIndex: number; part: StoredPart }> =
    [];
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
          toPrune.push({ messageId: msg.id, partIndex, part });
        }
      }
    }
  }

  log.info('prune scan', { pruned, total });

  if (pruned > PRUNE_MINIMUM) {
    const grouped = new Map<PrefixedString<'msg'>, Array<{ partIndex: number; part: StoredPart }>>();
    for (const entry of toPrune) {
      let arr = grouped.get(entry.messageId);
      if (!arr) {
        arr = [];
        grouped.set(entry.messageId, arr);
      }
      arr.push(entry);
    }

    for (const [messageId, entries] of grouped) {
      const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
      if (!msg) continue;

      const updatedParts = [...msg.parts];
      for (const { partIndex, part } of entries) {
        if (updatedParts[partIndex]?.type === 'tool-result') {
          updatedParts[partIndex] = {
            ...part,
            output: '[Old tool result content cleared]',
          } as StoredPart;
        }
      }

      await db
        .update(messages)
        .set({ parts: updatedParts, updatedAt: new Date() })
        .where(eq(messages.id, messageId));
    }

    log.info('pruned', { count: toPrune.length });
  }

  return pruned;
}

const COMPACTION_PROMPT = `Provide a detailed prompt for continuing our conversation above.
Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next.
The summary that you construct will be used so that another agent can read it and continue the work.

When constructing the summary, try to stick to this template:
---
## Goal

[What goal(s) is the user trying to accomplish?]

## Instructions

- [What important instructions did the user give you that are relevant]
- [If there is a plan or spec, include information about it so next agent can continue using it]

## Discoveries

[What notable things were learned during this conversation that would be useful for the next agent to know when continuing the work]

## Accomplished

[What work has been completed, what work is still in progress, and what work is left?]

## Relevant files / directories

[Construct a structured list of relevant files that have been read, edited, or created that pertain to the task at hand. If all the files in a directory are relevant, include the path to the directory.]
---`;

/**
 * Build LLM-compatible messages from stored messages, stopping at the most
 * recent compaction summary. If a summary exists, it becomes the first
 * message in the returned array.
 */
function buildHistoryMessages(
  msgs: Array<{
    role: string;
    parts: StoredPart[];
    isSummary: boolean;
  }>,
): ModelMessage[] {
  const llmMessages: ModelMessage[] = [];

  for (const msg of msgs) {
    if (msg.role === 'user') {
      const hasCompaction = msg.parts.some((p) => p.type === 'compaction');
      if (hasCompaction) continue;

      const text = msg.parts
        .filter((p): p is StoredPart & { type: 'text-delta' } => p.type === 'text-delta')
        .map((p) => p.text)
        .join('');
      if (text) {
        llmMessages.push({ role: 'user', content: text });
      }
      continue;
    }

    // For compaction context: if this is a summary message, present it as assistant text
    if (msg.role === 'assistant' && msg.isSummary) {
      const text = msg.parts
        .filter((p): p is StoredPart & { type: 'text-delta' } => p.type === 'text-delta')
        .map((p) => p.text)
        .join('');
      if (text) {
        llmMessages.push({ role: 'assistant', content: text });
      }
      continue;
    }

    if (msg.role === 'assistant') {
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
        const assistantContent: Array<
          { type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
        > = [];

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
  }

  return llmMessages;
}

async function resolveCompactionModel(
  fallbackProviderId: string,
  fallbackModelId: string,
): Promise<{ providerId: string; modelId: string; credentials: ProviderCredentials; limits: ModelLimits }> {
  const resolved = await resolveCheapModel({
    settingsKey: 'model.compaction',
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

/**
 * Run a full compaction cycle for a session:
 * 1. Insert a compaction marker (user message with compaction part)
 * 2. Prune old tool outputs
 * 3. Send history to LLM for summarization
 * 4. Store the summary as an assistant message with isSummary=true
 * 5. Optionally replay the last user message for continuation
 */
export async function compact(input: {
  sessionId: PrefixedString<'ses'>;
  providerId: string;
  modelId: string;
  auto: boolean;
  overflow?: boolean;
}): Promise<'continue' | 'error'> {
  const { sessionId } = input;

  if (activeCompactions.has(sessionId)) {
    log.warn('compaction already in progress', { sessionId });
    return 'error';
  }

  activeCompactions.add(sessionId);
  const summaryMessageId = createMessageId();

  try {
    log.info('compaction starting', { sessionId, auto: input.auto });

    await Sse.broadcast('compaction-start', { sessionId, messageId: summaryMessageId });

    // Step 1: Insert compaction marker as a user message
    const compactionMarkerId = createMessageId();
    const now = Date.now();
    const compactionPart: StoredPart = {
      type: 'compaction',
      id: createPartId(),
      auto: input.auto,
      overflow: input.overflow,
      startedAt: now,
      endedAt: now,
    } as StoredPart;

    const db = getDb();
    await db.insert(messages).values({
      id: compactionMarkerId,
      sessionId,
      role: 'user',
      parts: [compactionPart],
      modelId: input.modelId,
      providerId: input.providerId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      startedAt: new Date(now),
      duration: null,
    });

    // Step 2: Prune old tool outputs
    await prune(sessionId);

    // Step 3: Resolve the compaction model and send history for summarization
    const resolved = await resolveCompactionModel(input.providerId, input.modelId);
    const provider = createProvider(resolved.credentials);
    const model = provider(resolved.modelId);

    // Fetch all messages up to (but not including) the compaction marker
    const allMsgs = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt));

    const markerIndex = allMsgs.findIndex((m) => m.id === compactionMarkerId);
    const historyMsgs = allMsgs.slice(0, markerIndex);

    // Find the last compaction boundary and only use messages after it
    let startIndex = 0;
    for (let i = historyMsgs.length - 1; i >= 0; i--) {
      if (historyMsgs[i].isSummary) {
        startIndex = i;
        break;
      }
    }
    const relevantMsgs = historyMsgs.slice(startIndex);

    const historyMessages = buildHistoryMessages(relevantMsgs);

    // Append the compaction prompt
    const llmMessages: ModelMessage[] = [
      ...historyMessages,
      { role: 'user', content: COMPACTION_PROMPT },
    ];

    const result = await streamText({
      model,
      messages: llmMessages,
      maxOutputTokens: 4096,
    });

    let summaryText = '';
    for await (const chunk of result.textStream) {
      summaryText += chunk;
    }

    if (!summaryText.trim()) {
      log.error('compaction produced empty summary', { sessionId });
      return 'error';
    }

    // Step 4: Store the summary as an assistant message
    const usage = await result.usage;
    const summaryNow = Date.now();
    const summaryPart: StoredPart = {
      type: 'text-delta',
      id: createPartId(),
      text: summaryText,
      startedAt: summaryNow,
      endedAt: summaryNow,
    } as StoredPart;

    await db.insert(messages).values({
      id: summaryMessageId,
      sessionId,
      role: 'assistant',
      parts: [summaryPart],
      modelId: resolved.modelId,
      providerId: resolved.providerId,
      usage,
      finishReason: 'stop',
      isSummary: true,
      createdAt: new Date(summaryNow),
      updatedAt: new Date(summaryNow),
      startedAt: new Date(summaryNow),
      duration: Date.now() - now,
    });

    await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId));

    log.info('compaction complete', {
      sessionId,
      summaryTokens: estimate(summaryText),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    await Sse.broadcast('compaction-complete', { sessionId, summaryMessageId });
    await Sse.broadcast('data-change', { queryKey: ['sessions', sessionId] });

    return 'continue';
  } catch (error) {
    log.error('compaction failed', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });

    await Sse.broadcast('stream-error', {
      sessionId,
      messageId: summaryMessageId,
      error: `Compaction failed: ${error instanceof Error ? error.message : String(error)}`,
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

  return buildHistoryMessages(msgs.slice(startIndex));
}

/**
 * Look up model limits for a given provider/model combination.
 */
export async function getModelLimits(
  providerId: string,
  modelId: string,
): Promise<ModelLimits> {
  const providers = await Models.get();
  const provider = providers[providerId];
  const model = provider?.models[modelId];
  return model?.limit ?? { context: 200_000, output: 8_192 };
}
