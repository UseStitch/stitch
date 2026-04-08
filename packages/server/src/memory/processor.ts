import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { generateText, Output } from 'ai';

import type { PrefixedString } from '@stitch/shared/id';

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
import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { createProvider } from '@/llm/provider/provider.js';
import { recordUsageEvent } from '@/usage/ledger.js';
import { calculateMessageCostUsd } from '@/utils/cost.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'memory-processor' });

const MEMORY_SOURCE = 'memory_extraction' as const;

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

    const resolved = await resolveCheapModel({
      providerIdKey: 'model.title.providerId',
      modelIdKey: 'model.title.modelId',
      fallbackProviderId: input.providerId,
      fallbackModelId: input.modelId,
    });

    if (!resolved) {
      log.warn('no model available for memory extraction');
      return;
    }

    const model = createProvider(resolved.credentials)(resolved.modelId);
    const runId = randomUUID();

    let memorySource: MemorySource = input.memorySource ?? 'chat';
    if (!input.memorySource) {
      const db = getDb();
      const [session] = await db
        .select({ type: sessions.type })
        .from(sessions)
        .where(eq(sessions.id, input.sessionId as PrefixedString<'ses'>))
        .limit(1);
      if (session?.type === 'automation') {
        memorySource = 'automation';
      }
    }

    // Step 1: Extract facts from the conversation turn (structured output)
    const extractionPrompt = buildExtractionPrompt(input.userMessage, input.assistantMessage);
    const extractionStart = Date.now();
    const extractionResult = await generateText({
      model,
      output: Output.object({ schema: extractionSchema }),
      messages: [{ role: 'user', content: extractionPrompt }],
    });
    const extractionEnd = Date.now();

    if (extractionResult.usage) {
      const costUsd = await calculateMessageCostUsd({
        providerId: resolved.providerId,
        modelId: resolved.modelId,
        usage: extractionResult.usage,
      });
      await recordUsageEvent({
        runId,
        source: MEMORY_SOURCE,
        status: 'succeeded',
        providerId: resolved.providerId,
        modelId: resolved.modelId,
        usage: extractionResult.usage,
        costUsd,
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

    // Step 2: For each fact, check for duplicates and decide action (structured output)
    for (const fact of facts) {
      const existing = await searchSemanticMemories(fact.content, 5);

      const dedupPrompt = buildDeduplicationPrompt(fact, existing);
      const dedupStart = Date.now();
      const dedupResult = await generateText({
        model,
        output: Output.object({ schema: deduplicationSchema }),
        messages: [{ role: 'user', content: dedupPrompt }],
      });
      const dedupEnd = Date.now();

      if (dedupResult.usage) {
        const costUsd = await calculateMessageCostUsd({
          providerId: resolved.providerId,
          modelId: resolved.modelId,
          usage: dedupResult.usage,
        });
        await recordUsageEvent({
          runId,
          source: MEMORY_SOURCE,
          status: 'succeeded',
          providerId: resolved.providerId,
          modelId: resolved.modelId,
          usage: dedupResult.usage,
          costUsd,
          metadata: { phase: 'deduplication', factContent: fact.content },
          startedAt: dedupStart,
          endedAt: dedupEnd,
        });
      }

      const decision = dedupResult.output;
      if (!decision || decision.action === 'NONE') continue;

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
