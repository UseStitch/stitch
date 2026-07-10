import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { llmUsageEvents } from '@/db/schema/usage.js';
import type { ChatLlmUsageMetadata, ChatTitleGenerationLlmUsageMetadata } from '@/db/schema/usage.js';
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
    const metadata: ChatLlmUsageMetadata = {
      source: 'chat',
      eventType: 'step-success',
      sessionId: 'ses_test1',
      messageId: 'msg_test1',
      stepIndex: 0,
      attemptIndex: 1,
      finishReason: 'stop',
    };

    const { costUsd } = await recordLlmUsage({
      source: 'chat',
      providerId: 'any_provider',
      modelId: 'any_model',
      usage: null,
      metadata,
      startedAt: Date.now(),
    });

    expect(costUsd).toBe(0);
  });

  test('returns 0 cost when model has no pricing info', async () => {
    const metadata: ChatLlmUsageMetadata = {
      source: 'chat',
      eventType: 'step-success',
      sessionId: 'ses_test2',
      messageId: 'msg_test2',
      stepIndex: 0,
      attemptIndex: 1,
      finishReason: 'stop',
    };

    const { costUsd } = await recordLlmUsage({
      source: 'chat',
      providerId: 'unknown_provider',
      modelId: 'unknown_model',
      usage: buildUsage(1_000, 500),
      metadata,
      startedAt: Date.now(),
    });

    expect(costUsd).toBe(0);
  });

  test('writes usage event to DB and returns computed costUsd', async () => {
    const startedAt = Date.now();

    const { costUsd } = await recordLlmUsage({
      source: 'compaction',
      providerId: 'unknown_provider',
      modelId: 'unknown_model',
      usage: buildUsage(100, 50),
      metadata: { source: 'compaction', sessionId: 'ses_test3', messageId: 'msg_test3', auto: true, overflow: false },
      startedAt,
    });

    expect(typeof costUsd).toBe('number');

    const db = getDb();
    const events = await db.select().from(llmUsageEvents).where(eq(llmUsageEvents.source, 'compaction'));

    expect(events.length).toBe(1);
    expect(events[0]?.source).toBe('compaction');
    expect(events[0]?.inputTokens).toBe(100);
    expect(events[0]?.outputTokens).toBe(50);
  });

  test('writes correct status and metadata fields', async () => {
    const startedAt = Date.now();

    const metadata: ChatTitleGenerationLlmUsageMetadata = {
      source: 'title_generation',
      target: 'chat',
      sessionId: 'ses_test4',
      messageId: 'msg_test4',
    };

    await recordLlmUsage({
      source: 'title_generation',
      status: 'failed',
      providerId: 'unknown_provider',
      modelId: 'unknown_model',
      errorCode: 'rate_limit',
      metadata,
      startedAt,
      endedAt: startedAt + 100,
      durationMs: 100,
    });

    const db = getDb();
    const events = await db.select().from(llmUsageEvents).where(eq(llmUsageEvents.source, 'title_generation'));

    expect(events.length).toBe(1);
    expect(events[0]?.status).toBe('failed');
    expect(events[0]?.errorCode).toBe('rate_limit');
    expect(events[0]?.durationMs).toBe(100);
  });
});
