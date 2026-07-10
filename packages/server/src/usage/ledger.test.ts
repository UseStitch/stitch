import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { llmUsageEvents } from '@/db/schema/usage.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { recordLlmUsage } from '@/usage/ledger.js';
import type { LanguageModelUsage } from 'ai';

setupTestDb();

function buildUsage(inputTokens: number, outputTokens: number): LanguageModelUsage {
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputTokenDetails: { noCacheTokens: inputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
    outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 },
  };
}

describe('recordLlmUsage', () => {
  test('returns 0 cost when usage is null', async () => {
    const { costUsd } = await recordLlmUsage({
      runId: 'run-null-usage',
      source: 'chat',
      providerId: 'any_provider',
      modelId: 'any_model',
      usage: null,
      startedAt: Date.now(),
    });

    expect(costUsd).toBe(0);
  });

  test('returns 0 cost when model has no pricing info', async () => {
    const { costUsd } = await recordLlmUsage({
      runId: 'run-no-pricing',
      source: 'chat',
      providerId: 'unknown_provider',
      modelId: 'unknown_model',
      usage: buildUsage(1_000, 500),
      startedAt: Date.now(),
    });

    expect(costUsd).toBe(0);
  });

  test('writes usage event to DB and returns computed costUsd', async () => {
    const runId = 'run-db-write-test';
    const startedAt = Date.now();

    const { costUsd } = await recordLlmUsage({
      runId,
      source: 'compaction',
      providerId: 'unknown_provider',
      modelId: 'unknown_model',
      usage: buildUsage(100, 50),
      startedAt,
    });

    expect(typeof costUsd).toBe('number');

    const db = getDb();
    const events = await db.select().from(llmUsageEvents).where(eq(llmUsageEvents.runId, runId));

    expect(events.length).toBe(1);
    expect(events[0]?.source).toBe('compaction');
    expect(events[0]?.inputTokens).toBe(100);
    expect(events[0]?.outputTokens).toBe(50);
  });

  test('writes correct status and metadata fields', async () => {
    const runId = 'run-fields-test';
    const startedAt = Date.now();

    await recordLlmUsage({
      runId,
      source: 'title_generation',
      status: 'failed',
      providerId: 'unknown_provider',
      modelId: 'unknown_model',
      errorCode: 'rate_limit',
      metadata: { phase: 'title' },
      startedAt,
      endedAt: startedAt + 100,
      durationMs: 100,
    });

    const db = getDb();
    const events = await db.select().from(llmUsageEvents).where(eq(llmUsageEvents.runId, runId));

    expect(events.length).toBe(1);
    expect(events[0]?.status).toBe('failed');
    expect(events[0]?.errorCode).toBe('rate_limit');
    expect(events[0]?.durationMs).toBe(100);
  });
});
