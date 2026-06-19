import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';

import { getDb } from '@/db/client.js';
import { llmUsageEvents } from '@/db/schema/usage.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { isServiceError } from '@/lib/service-result.js';
import { getUsageDashboard, usageServiceInternals } from '@/usage/service.js';

setupTestDb();

describe('usageServiceInternals.inferGranularity', () => {
  test('uses hourly buckets for short ranges', () => {
    const from = Date.UTC(2026, 0, 1, 0, 0, 0);
    const to = Date.UTC(2026, 0, 2, 0, 0, 0);

    expect(usageServiceInternals.inferGranularity({ from, to })).toBe('hour');
  });

  test('uses weekly buckets when daily buckets would exceed target count', () => {
    const from = Date.UTC(2026, 0, 1, 0, 0, 0);
    const to = Date.UTC(2026, 2, 1, 0, 0, 0);

    expect(usageServiceInternals.inferGranularity({ from, to })).toBe('week');
  });

  test('uses monthly buckets for very long ranges', () => {
    const from = Date.UTC(2025, 0, 1, 0, 0, 0);
    const to = Date.UTC(2026, 0, 1, 0, 0, 0);

    expect(usageServiceInternals.inferGranularity({ from, to })).toBe('month');
  });
});

describe('usageServiceInternals.floorToGranularity', () => {
  test('floors weekly buckets to Monday', () => {
    const thursday = Date.UTC(2026, 2, 26, 15, 30, 0);
    const floor = usageServiceInternals.floorToGranularity(thursday, 'week');

    const date = new Date(floor);
    expect(date.getUTCDay()).toBe(1);
  });
});

describe('usageServiceInternals.buildBucketRanges', () => {
  test('builds continuous non-overlapping daily buckets', () => {
    const from = Date.UTC(2026, 0, 1, 12, 0, 0);
    const to = Date.UTC(2026, 0, 4, 12, 0, 0);
    const buckets = usageServiceInternals.buildBucketRanges({ from, to }, 'day');

    expect(buckets.length).toBe(4);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i]?.start).toBe(buckets[i - 1]?.end);
    }
  });
});

async function insertEvent(opts: {
  runId?: string;
  source: string;
  providerId: string;
  modelId: string;
  costUsd: number;
  startedAt: number;
  status?: string;
  isAttributable?: boolean;
}): Promise<void> {
  const db = getDb();
  await db.insert(llmUsageEvents).values({
    id: randomUUID(),
    runId: opts.runId ?? randomUUID(),
    source: opts.source,
    status: opts.status ?? 'succeeded',
    isAttributable: opts.isAttributable ?? true,
    sessionId: null,
    messageId: null,
    providerId: opts.providerId,
    modelId: opts.modelId,
    inputTokens: 100,
    outputTokens: 50,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 150,
    costUsd: opts.costUsd,
    errorCode: null,
    startedAt: opts.startedAt,
    endedAt: opts.startedAt + 1000,
    durationMs: 1000,
  });
}

describe('getUsageDashboard', () => {
  test('returns empty totals when no events exist', async () => {
    const now = Date.now();
    const result = await getUsageDashboard({
      from: now - 60_000,
      to: now,
    });

    expect(isServiceError(result)).toBe(false);
    if (isServiceError(result)) return;

    expect(result.data.totals.costUsd).toBe(0);
    expect(result.data.totals.tokenMetrics.totalTokens).toBe(0);
  });

  test('aggregates cost across events in range', async () => {
    const now = Date.now();
    const from = now - 60_000;

    await insertEvent({
      source: 'chat',
      providerId: 'openai',
      modelId: 'gpt-4',
      costUsd: 0.01,
      startedAt: from + 1_000,
    });
    await insertEvent({
      source: 'chat',
      providerId: 'openai',
      modelId: 'gpt-4',
      costUsd: 0.02,
      startedAt: from + 2_000,
    });

    const result = await getUsageDashboard({ from, to: now });

    expect(isServiceError(result)).toBe(false);
    if (isServiceError(result)) return;

    expect(result.data.totals.costUsd).toBeCloseTo(0.03);
  });

  test('excludes transcription from LLM usage totals', async () => {
    const now = Date.now();
    const from = now - 10_000;

    await insertEvent({
      source: 'transcription_recording',
      providerId: 'openai',
      modelId: 'gpt-realtime-whisper',
      costUsd: 0.25,
      startedAt: from + 1_000,
    });

    const result = await getUsageDashboard({ from, to: now });

    expect(isServiceError(result)).toBe(false);
    if (isServiceError(result)) return;

    expect(result.data.totals.costUsd).toBe(0);
    expect(result.data.sources).not.toContain('transcription');
  });

  test('excludes events outside the time range', async () => {
    const now = Date.now();
    const from = now - 10_000;

    await insertEvent({
      source: 'chat',
      providerId: 'openai',
      modelId: 'gpt-4',
      costUsd: 5.0,
      startedAt: now - 60_000, // outside range
    });

    const result = await getUsageDashboard({ from, to: now });

    expect(isServiceError(result)).toBe(false);
    if (isServiceError(result)) return;

    expect(result.data.totals.costUsd).toBe(0);
  });

  test('excludes non-attributable events from totals', async () => {
    const now = Date.now();
    const from = now - 10_000;

    await insertEvent({
      source: 'chat',
      providerId: 'openai',
      modelId: 'gpt-4',
      costUsd: 9.99,
      startedAt: from + 1_000,
      isAttributable: false,
    });

    const result = await getUsageDashboard({ from, to: now });

    expect(isServiceError(result)).toBe(false);
    if (isServiceError(result)) return;

    expect(result.data.totals.costUsd).toBe(0);
  });

  test('excludes failed events from totals', async () => {
    const now = Date.now();
    const from = now - 10_000;

    await insertEvent({
      source: 'chat',
      providerId: 'openai',
      modelId: 'gpt-4',
      costUsd: 9.99,
      startedAt: from + 1_000,
      status: 'failed',
    });

    const result = await getUsageDashboard({ from, to: now });

    expect(isServiceError(result)).toBe(false);
    if (isServiceError(result)) return;

    expect(result.data.totals.costUsd).toBe(0);
  });

  test('populates usedProviders and usedModels from events in range', async () => {
    const now = Date.now();
    const from = now - 10_000;

    await insertEvent({
      source: 'chat',
      providerId: 'anthropic',
      modelId: 'claude-3',
      costUsd: 0.01,
      startedAt: from + 1_000,
    });

    const result = await getUsageDashboard({ from, to: now });

    expect(isServiceError(result)).toBe(false);
    if (isServiceError(result)) return;

    expect(result.data.usedProviders).toContain('anthropic');
    expect(
      result.data.usedModels.some(
        (m: { providerId: string; modelId: string }) =>
          m.providerId === 'anthropic' && m.modelId === 'claude-3',
      ),
    ).toBe(true);
  });

  test('filters results by providerId when specified', async () => {
    const now = Date.now();
    const from = now - 10_000;

    await insertEvent({
      source: 'chat',
      providerId: 'openai',
      modelId: 'gpt-4',
      costUsd: 1.0,
      startedAt: from + 1_000,
    });
    await insertEvent({
      source: 'chat',
      providerId: 'anthropic',
      modelId: 'claude-3',
      costUsd: 2.0,
      startedAt: from + 2_000,
    });

    const result = await getUsageDashboard({ from, to: now, providerId: 'openai' });

    expect(isServiceError(result)).toBe(false);
    if (isServiceError(result)) return;

    expect(result.data.totals.costUsd).toBeCloseTo(1.0);
    expect(result.data.usedProviders).toEqual(['openai']);
  });
});
