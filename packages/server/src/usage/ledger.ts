import { randomUUID } from 'node:crypto';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { llmUsageEvents } from '@/db/schema.js';
import type { LanguageModelUsage } from 'ai';

type UsageEventStatus = 'succeeded' | 'failed' | 'aborted';

type UsageMetrics = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
};

function safeNumber(value: number | null | undefined): number {
  if (typeof value !== 'number') {
    return 0;
  }

  return Number.isFinite(value) ? value : 0;
}

function extractUsageMetrics(usage: LanguageModelUsage | null | undefined): UsageMetrics {
  const inputTokens = safeNumber(usage?.inputTokens);
  const outputTokens = safeNumber(usage?.outputTokens);
  const reasoningTokens = safeNumber(usage?.outputTokenDetails?.reasoningTokens);
  const cacheReadTokens = safeNumber(usage?.inputTokenDetails?.cacheReadTokens);
  const cacheWriteTokens = safeNumber(usage?.inputTokenDetails?.cacheWriteTokens);
  const totalTokens =
    safeNumber(usage?.totalTokens) ||
    inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens;

  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
  };
}

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
  const metrics = extractUsageMetrics(input.usage);

  await db.insert(llmUsageEvents).values({
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
