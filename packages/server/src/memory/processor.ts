import { generateText, Output } from 'ai';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema/sessions.js';
import * as Log from '@/lib/log.js';
import { isServiceError } from '@/lib/service-result.js';
import { createProvider } from '@/llm/provider/provider.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { getMemoryConfig, isMemoryActive } from '@/memory/config.js';
import {
  buildExtractionPrompt,
  buildDeduplicationPrompt,
  extractionSchema,
  deduplicationSchema,
} from '@/memory/prompts.js';
import {
  addSemanticMemory,
  updateSemanticMemory,
  deleteSemanticMemory,
  searchSemanticMemories,
  pruneStaleMemories,
} from '@/memory/service.js';
import type { MemorySource } from '@/memory/types.js';
import { recordUsageEvent } from '@/usage/ledger.js';
import { calculateMessageCostUsd } from '@/utils/cost.js';

const log = Log.create({ service: 'memory-processor' });

const MEMORY_SOURCE = 'memory_extraction' as const;

// ---------------------------------------------------------------------------
// Per-session write budget tracking (in-process, resets on server restart).
// Tracks: total facts written this session, and last turn index a write occurred.
// ---------------------------------------------------------------------------

type SessionWriteState = {
  factsWritten: number;
  lastWriteTurn: number;
  turnCount: number;
};

const sessionWriteState = new Map<string, SessionWriteState>();

function getSessionState(sessionId: string): SessionWriteState {
  let state = sessionWriteState.get(sessionId);
  if (!state) {
    state = { factsWritten: 0, lastWriteTurn: -1, turnCount: 0 };
    sessionWriteState.set(sessionId, state);
  }
  return state;
}

function incrementTurn(sessionId: string): SessionWriteState {
  const state = getSessionState(sessionId);
  state.turnCount++;
  return state;
}

function recordWrite(sessionId: string, count: number): void {
  const state = getSessionState(sessionId);
  state.factsWritten += count;
  state.lastWriteTurn = state.turnCount;
}

function recordUsageFireAndForget(params: {
  runId: string;
  providerId: string;
  modelId: string;
  usage: NonNullable<Awaited<ReturnType<typeof generateText>>['usage']>;
  metadata: Record<string, unknown>;
  startedAt: number;
  endedAt: number;
}): void {
  calculateMessageCostUsd({
    providerId: params.providerId,
    modelId: params.modelId,
    usage: params.usage,
  })
    .then((costUsd) =>
      recordUsageEvent({
        runId: params.runId,
        source: MEMORY_SOURCE,
        status: 'succeeded',
        providerId: params.providerId,
        modelId: params.modelId,
        usage: params.usage,
        costUsd,
        metadata: params.metadata,
        startedAt: params.startedAt,
        endedAt: params.endedAt,
      }),
    )
    .catch((err) => log.warn({ error: err }, 'failed to record memory usage event'));
}

/**
 * Asynchronously process a conversation turn to extract and persist memories.
 *
 * This is designed to be fire-and-forget after the response stream completes.
 * It never throws — all errors are caught and logged.
 */
export async function processMemories(input: {
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
  providerId: string;
  modelId: string;
  memorySource?: MemorySource;
}): Promise<void> {
  try {
    const config = await getMemoryConfig();
    if (!isMemoryActive(config) || !config.autoExtract) {
      return;
    }

    if (input.userMessage.trim().length < config.minMessageLength) {
      log.debug(
        { sessionId: input.sessionId, len: input.userMessage.length },
        'skipping extraction for short message',
      );
      return;
    }

    // Increment turn count and check write cooldown
    const sessionState = incrementTurn(input.sessionId);

    // Check per-session facts cap
    if (sessionState.factsWritten >= config.maxFactsPerSession) {
      log.debug(
        {
          sessionId: input.sessionId,
          factsWritten: sessionState.factsWritten,
          cap: config.maxFactsPerSession,
        },
        'skipping extraction: session facts cap reached',
      );
      return;
    }

    // Check cooldown: must be at least minTurnsBetweenWrites turns since last write
    if (
      config.minTurnsBetweenWrites > 0 &&
      sessionState.lastWriteTurn >= 0 &&
      sessionState.turnCount - sessionState.lastWriteTurn < config.minTurnsBetweenWrites
    ) {
      log.debug(
        {
          sessionId: input.sessionId,
          turnCount: sessionState.turnCount,
          lastWriteTurn: sessionState.lastWriteTurn,
          minTurns: config.minTurnsBetweenWrites,
        },
        'skipping extraction: write cooldown active',
      );
      return;
    }

    const [resolved, memorySource] = await Promise.all([
      resolveCheapModel({
        providerIdKey: 'model.title.providerId',
        modelIdKey: 'model.title.modelId',
        fallbackProviderId: input.providerId,
        fallbackModelId: input.modelId,
      }),
      resolveMemorySource(input.sessionId, input.memorySource),
    ]);

    if (!resolved) {
      log.warn('no model available for memory extraction');
      return;
    }

    const model = createProvider(resolved.credentials)(resolved.modelId);
    const runId = randomUUID();

    const extractionPrompt = buildExtractionPrompt(input.userMessage, input.assistantMessage);
    const extractionStart = Date.now();
    const extractionResult = await generateText({
      model,
      output: Output.object({ schema: extractionSchema }),
      messages: [{ role: 'user', content: extractionPrompt }],
    });
    const extractionEnd = Date.now();

    if (extractionResult.usage) {
      recordUsageFireAndForget({
        runId,
        providerId: resolved.providerId,
        modelId: resolved.modelId,
        usage: extractionResult.usage,
        metadata: { phase: 'extraction' },
        startedAt: extractionStart,
        endedAt: extractionEnd,
      });
    }

    let facts = extractionResult.output?.facts ?? [];
    if (facts.length === 0) {
      log.debug({ sessionId: input.sessionId }, 'no facts extracted from turn');
      return;
    }

    // Filter by confidence
    if (config.confidenceFilter !== 'all') {
      facts = facts.filter((fact) => {
        if (config.confidenceFilter === 'stated') return fact.confidence === 'stated';
        if (config.confidenceFilter === 'stated+confirmed')
          return fact.confidence === 'stated' || fact.confidence === 'confirmed';
        return true;
      });
    }

    // Gate 1: Importance score filter — discard low-value facts before any DB work
    facts = facts.filter((fact) => {
      if (fact.importanceScore < config.importanceMinScore) {
        log.debug(
          {
            factContent: fact.content,
            importanceScore: fact.importanceScore,
            threshold: config.importanceMinScore,
          },
          'discarding fact: below importance threshold',
        );
        return false;
      }
      return true;
    });

    // Gate 2: Durability filter — only persist long_term facts automatically
    facts = facts.filter((fact) => {
      if (fact.durability !== 'long_term') {
        log.debug(
          { factContent: fact.content, durability: fact.durability },
          'discarding fact: not long_term durability',
        );
        return false;
      }
      return true;
    });

    // Apply per-turn cap
    if (facts.length > config.maxFactsPerTurn) {
      // Keep highest-importance facts when capping
      facts = facts
        .sort((a, b) => b.importanceScore - a.importanceScore)
        .slice(0, config.maxFactsPerTurn);
    }

    // Apply remaining session budget
    const remainingBudget = config.maxFactsPerSession - sessionState.factsWritten;
    if (facts.length > remainingBudget) {
      facts = facts.slice(0, remainingBudget);
    }

    if (facts.length === 0) {
      log.debug({ sessionId: input.sessionId }, 'all facts filtered out after gates');
      return;
    }

    log.info(
      { sessionId: input.sessionId, factCount: facts.length },
      'extracted facts from conversation turn',
    );

    const existingMemoriesPerFact = await Promise.all(
      facts.map((fact) =>
        searchSemanticMemories({
          query: fact.content,
          page: 1,
          pageSize: 5,
        }).then((result) => (isServiceError(result) ? [] : result.data.memories)),
      ),
    );

    let addCount = 0;
    let updateCount = 0;
    let deleteCount = 0;
    let noneCount = 0;
    let skipCount = 0;

    for (let i = 0; i < facts.length; i++) {
      const fact = facts[i];
      const existing = existingMemoriesPerFact[i];

      // Similarity pre-check: skip dedup LLM call only when score is extremely high AND
      // no meaningful contradiction is likely. We now use a tighter threshold (0.95) to
      // ensure near-matches (0.85–0.95) still go through the dedup LLM which can catch
      // contradictions like "uses Python 3.9" vs "uses Python 3.12".
      const topMatch = existing[0];
      if (topMatch && topMatch.score >= 0.95) {
        log.info(
          { factContent: fact.content, score: topMatch.score },
          'skipping dedup: near-identical memory already exists',
        );
        skipCount++;
        continue;
      }

      const dedupPrompt = buildDeduplicationPrompt(fact, existing);
      const dedupStart = Date.now();
      const dedupResult = await generateText({
        model,
        output: Output.object({ schema: deduplicationSchema }),
        messages: [{ role: 'user', content: dedupPrompt }],
      });
      const dedupEnd = Date.now();

      if (dedupResult.usage) {
        recordUsageFireAndForget({
          runId,
          providerId: resolved.providerId,
          modelId: resolved.modelId,
          usage: dedupResult.usage,
          metadata: { phase: 'deduplication', factContent: fact.content },
          startedAt: dedupStart,
          endedAt: dedupEnd,
        });
      }

      const decision = dedupResult.output;
      if (!decision || decision.action === 'NONE') {
        noneCount++;
        continue;
      }

      log.info(
        {
          factContent: fact.content,
          action: decision.action,
          existingMemoryId: decision.existingMemoryId,
        },
        'dedup: applying decision',
      );

      switch (decision.action) {
        case 'ADD': {
          await addSemanticMemory(fact, memorySource, input.sessionId);
          addCount++;
          break;
        }
        case 'UPDATE': {
          if (decision.existingMemoryId && decision.updatedContent) {
            await updateSemanticMemory(decision.existingMemoryId, {
              content: decision.updatedContent,
            });
            updateCount++;
          }
          break;
        }
        case 'DELETE': {
          if (decision.existingMemoryId) {
            await deleteSemanticMemory(decision.existingMemoryId);
            deleteCount++;
          }
          break;
        }
      }
    }

    const writtenThisTurn = addCount + updateCount;
    if (writtenThisTurn > 0) {
      recordWrite(input.sessionId, writtenThisTurn);
    }

    log.info(
      {
        sessionId: input.sessionId,
        extracted: facts.length,
        decisions: {
          ADD: addCount,
          UPDATE: updateCount,
          DELETE: deleteCount,
          NONE: noneCount,
          SKIPPED_HIGH_SIMILARITY: skipCount,
        },
        sessionBudget: {
          factsWritten: sessionWriteState.get(input.sessionId)?.factsWritten,
          cap: config.maxFactsPerSession,
        },
      },
      'memory processing complete',
    );

    if (config.autoprune && (addCount > 0 || updateCount > 0)) {
      await pruneStaleMemories({
        maxMemories: config.maxMemories,
        staleDays: config.staleDays,
      }).catch((err) => log.warn({ error: err }, 'failed to auto-prune stale memories'));
    }
  } catch (error) {
    log.error({ error, sessionId: input.sessionId }, 'memory processing failed');
  }
}

async function resolveMemorySource(
  sessionId: string,
  override: MemorySource | undefined,
): Promise<MemorySource> {
  if (override) return override;

  const db = getDb();
  const [session] = await db
    .select({ type: sessions.type })
    .from(sessions)
    .where(eq(sessions.id, sessionId as PrefixedString<'ses'>))
    .limit(1);

  return session?.type === 'automation' ? 'automation' : 'chat';
}
