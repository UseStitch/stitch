import { generateText, Output } from 'ai';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { createProvider } from '@/llm/provider/provider.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { getMemoryConfig } from '@/memory/config.js';
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
} from '@/memory/service.js';
import type { MemorySource } from '@/memory/types.js';
import { recordUsageEvent } from '@/usage/ledger.js';
import { calculateMessageCostUsd } from '@/utils/cost.js';

const log = Log.create({ service: 'memory-processor' });

const MEMORY_SOURCE = 'memory_extraction' as const;

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
    if (!config.enabled || !config.autoExtract) {
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

    const facts = extractionResult.output?.facts ?? [];
    if (facts.length === 0) {
      log.debug({ sessionId: input.sessionId }, 'no facts extracted from turn');
      return;
    }

    log.info(
      { sessionId: input.sessionId, factCount: facts.length },
      'extracted facts from conversation turn',
    );

    const existingMemoriesPerFact = await Promise.all(
      facts.map((fact) => searchSemanticMemories(fact.content, 5)),
    );

    for (let i = 0; i < facts.length; i++) {
      const fact = facts[i];
      const existing = existingMemoriesPerFact[i];

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
      if (!decision || decision.action === 'NONE') continue;

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
          break;
        }
        case 'UPDATE': {
          if (decision.existingMemoryId && decision.updatedContent) {
            await updateSemanticMemory(decision.existingMemoryId, {
              content: decision.updatedContent,
            });
          }
          break;
        }
        case 'DELETE': {
          if (decision.existingMemoryId) {
            await deleteSemanticMemory(decision.existingMemoryId);
          }
          break;
        }
      }
    }

    log.info({ sessionId: input.sessionId }, 'memory processing complete');
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
