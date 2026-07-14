import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { registerTitleGenerationAdapter } from '@/adapters/title-generation.js';
import { getDb } from '@/db/client.js';
import { recordingAnalyses, recordings } from '@/db/schema/recordings.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { llmUsageEvents } from '@/db/schema/usage.js';
import { setupTestDb } from '@/db/test-helpers.js';
import type { InternalEventMap } from '@/lib/internal-bus-events.js';
import { internalBus } from '@/lib/internal-bus.js';
import { ZERO_USAGE } from '@/utils/usage.js';

setupTestDb();

const sessionId = 'ses_title_adapter' as PrefixedString<'ses'>;
const recordingId = 'rec_title_adapter' as PrefixedString<'rec'>;
const analysisId = 'recan_title_adapter' as PrefixedString<'recan'>;

async function waitFor(assertion: () => Promise<boolean>): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 1_000) {
    if (await assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for assertion');
}

async function seedSession(): Promise<void> {
  const now = Date.now();
  await getDb()
    .insert(sessions)
    .values({
      id: sessionId,
      title: null,
      type: 'chat',
      automationId: null,
      parentSessionId: null,
      createdAt: now,
      updatedAt: now,
    });
}

async function seedRecordingAnalysis(): Promise<void> {
  const now = Date.now();
  await getDb()
    .insert(recordings)
    .values({
      id: recordingId,
      title: 'Raw Recording',
      source: 'manual',
      status: 'completed',
      platform: 'manual',
      startedAt: now - 1_000,
      endedAt: now,
    });

  await getDb()
    .insert(recordingAnalyses)
    .values({
      id: analysisId,
      recordingId,
      status: 'completed',
      title: 'Recording analysis',
      usage: ZERO_USAGE,
      costUsd: 1,
      startedAt: now - 500,
      endedAt: now,
      durationMs: 500,
    });
}

describe('title generation adapter', () => {
  beforeEach(() => {
    internalBus.clear();
  });

  afterEach(() => {
    internalBus.clear();
  });

  test('handles chat title requests', async () => {
    await seedSession();
    const emitted: InternalEventMap['session.title.updated'][] = [];
    internalBus.onSync('session.title.updated', (event) => emitted.push(event));
    registerTitleGenerationAdapter({
      generateTitle: async (content, fallbackProviderId, fallbackModelId) => ({
        title: `Title: ${content}`,
        providerId: fallbackProviderId,
        modelId: fallbackModelId,
        usage: ZERO_USAGE,
      }),
    });

    internalBus.emit('title.generation.chat.requested', {
      sessionId,
      content: 'Chat Content',
      fallbackProviderId: 'openai',
      fallbackModelId: 'gpt-5',
    });

    await waitFor(async () => {
      const [session] = await getDb().select().from(sessions).where(eq(sessions.id, sessionId));
      return session?.title === 'Title: Chat Content';
    });

    const titleMessages = await getDb().select().from(messages).where(eq(messages.sessionId, sessionId));
    const usageRows = await getDb().select().from(llmUsageEvents).where(eq(llmUsageEvents.source, 'title_generation'));

    expect(titleMessages).toHaveLength(1);
    expect(titleMessages[0].parts[0]).toMatchObject({ type: 'session-title', title: 'Title: Chat Content' });
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]).toMatchObject({ providerId: 'openai', modelId: 'gpt-5' });
    expect(usageRows[0].metadata).toMatchObject({ sessionId, target: 'chat' });
    expect(emitted).toEqual([{ sessionId, title: 'Title: Chat Content' }]);
  });

  test('handles recording analysis title requests', async () => {
    await seedRecordingAnalysis();
    const emitted: InternalEventMap['recording.analysis.updated'][] = [];
    internalBus.onSync('recording.analysis.updated', (event) => emitted.push(event));
    registerTitleGenerationAdapter({
      generateTitle: async () => ({
        title: 'Generated Recording Title',
        providerId: 'openai',
        modelId: 'gpt-5',
        usage: ZERO_USAGE,
      }),
    });

    internalBus.emit('title.generation.recording_analysis.requested', {
      recordingId,
      analysisId,
      content: 'Recording Content',
      fallbackProviderId: 'openai',
      fallbackModelId: 'gpt-5',
    });

    await waitFor(async () => {
      const [analysis] = await getDb().select().from(recordingAnalyses).where(eq(recordingAnalyses.id, analysisId));
      return analysis?.title === 'Generated Recording Title';
    });

    const [analysis] = await getDb().select().from(recordingAnalyses).where(eq(recordingAnalyses.id, analysisId));
    const usageRows = await getDb().select().from(llmUsageEvents).where(eq(llmUsageEvents.source, 'title_generation'));

    expect(analysis.costUsd).toBe(1);
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0].metadata).toMatchObject({ target: 'recording-analysis', recordingId, analysisId });
    expect(emitted).toEqual([{ recordingId, status: 'completed', title: 'Generated Recording Title' }]);
  });

  test('increments recording analysis cost by generated title cost', async () => {
    await seedRecordingAnalysis();
    registerTitleGenerationAdapter({
      generateTitle: async () => ({
        title: 'Generated Recording Title',
        providerId: 'openai',
        modelId: 'gpt-5',
        usage: ZERO_USAGE,
      }),
      recordTitleUsage: async () => ({ costUsd: 0.25 }),
    });

    internalBus.emit('title.generation.recording_analysis.requested', {
      recordingId,
      analysisId,
      content: 'Recording Content',
      fallbackProviderId: 'openai',
      fallbackModelId: 'gpt-5',
    });

    await waitFor(async () => {
      const [analysis] = await getDb().select().from(recordingAnalyses).where(eq(recordingAnalyses.id, analysisId));
      return analysis?.costUsd === 1.25;
    });

    const [analysis] = await getDb().select().from(recordingAnalyses).where(eq(recordingAnalyses.id, analysisId));
    expect(analysis.costUsd).toBe(1.25);
  });

  test('ignores generator failures', async () => {
    await seedSession();
    registerTitleGenerationAdapter({
      generateTitle: async () => {
        throw new Error('failed');
      },
    });

    internalBus.emit('title.generation.chat.requested', {
      sessionId,
      content: 'Chat Content',
      fallbackProviderId: 'openai',
      fallbackModelId: 'gpt-5',
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const [session] = await getDb().select().from(sessions).where(eq(sessions.id, sessionId));
    const titleMessages = await getDb().select().from(messages).where(eq(messages.sessionId, sessionId));
    expect(session.title).toBeNull();
    expect(titleMessages).toHaveLength(0);
  });
});
