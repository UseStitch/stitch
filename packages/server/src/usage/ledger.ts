import { randomUUID } from 'node:crypto';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { embeddingUsageEvents, llmUsageEvents } from '@/db/schema/usage.js';
import * as Log from '@/lib/log.js';
import { calculateEmbeddingCostUsd, calculateMessageCostUsd } from '@/usage/cost.js';
import { normalizeUsage } from '@/utils/usage.js';
import type { LanguageModelUsage } from 'ai';

const log = Log.create({ service: 'usage-ledger' });

type UsageEventStatus = 'succeeded' | 'failed' | 'aborted';

export async function recordUsageEvent(input: {
  runId: string;
  source: string;
  status?: UsageEventStatus;
  isAttributable?: boolean;
  sessionId?: PrefixedString<'ses'> | null;
  messageId?: PrefixedString<'msg'> | null;
  stepIndex?: number;
  attemptIndex?: number;
  providerId: string;
  modelId: string;
  usage?: LanguageModelUsage | null;
  metadata?: Record<string, unknown>;
  costUsd?: number;
  errorCode?: string | null;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
}): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const endedAt = input.endedAt ?? now;
  const durationMs = input.durationMs ?? Math.max(0, endedAt - input.startedAt);
  const metrics = normalizeUsage(input.usage);

  await db
    .insert(llmUsageEvents)
    .values({
      id: randomUUID(),
      runId: input.runId,
      source: input.source,
      status: input.status ?? 'succeeded',
      isAttributable: input.isAttributable ?? true,
      sessionId: input.sessionId ?? null,
      messageId: input.messageId ?? null,
      stepIndex: input.stepIndex,
      attemptIndex: input.attemptIndex,
      providerId: input.providerId,
      modelId: input.modelId,
      usage: input.usage ?? undefined,
      metadata: input.metadata,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      reasoningTokens: metrics.reasoningTokens,
      cacheReadTokens: metrics.cacheReadTokens,
      cacheWriteTokens: metrics.cacheWriteTokens,
      totalTokens: metrics.totalTokens,
      costUsd: input.costUsd ?? 0,
      errorCode: input.errorCode ?? null,
      startedAt: input.startedAt,
      endedAt,
      durationMs,
    });
}

export async function recordLlmUsage(input: {
  runId: string;
  source: string;
  providerId: string;
  modelId: string;
  usage?: LanguageModelUsage | null;
  status?: UsageEventStatus;
  isAttributable?: boolean;
  sessionId?: PrefixedString<'ses'> | null;
  messageId?: PrefixedString<'msg'> | null;
  stepIndex?: number;
  attemptIndex?: number;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
}): Promise<{ costUsd: number }> {
  const costUsd = input.usage
    ? await calculateMessageCostUsd({ providerId: input.providerId, modelId: input.modelId, usage: input.usage })
    : 0;

  try {
    await recordUsageEvent({ ...input, costUsd });
  } catch (error) {
    log.warn({ error, source: input.source, runId: input.runId }, 'usage event write failed');
  }

  return { costUsd };
}

export async function recordEmbeddingUsage(input: {
  providerId: string;
  modelId: string;
  tokens: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const costUsd = await calculateEmbeddingCostUsd({
    providerId: input.providerId,
    modelId: input.modelId,
    tokens: input.tokens,
  });

  const db = getDb();
  try {
    await db
      .insert(embeddingUsageEvents)
      .values({
        id: randomUUID(),
        providerId: input.providerId,
        modelId: input.modelId,
        totalTokens: input.tokens,
        costUsd,
        metadata: input.metadata,
      });
  } catch (error) {
    log.warn({ error, providerId: input.providerId, modelId: input.modelId }, 'embedding usage event write failed');
  }
}
