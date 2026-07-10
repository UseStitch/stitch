import { MockLanguageModelV3 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { meetingNoteTemplates, recordingAnalyses, recordings } from '@/db/schema/recordings.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { internalBus } from '@/lib/internal-bus.js';
import { ok } from '@/lib/service-result.js';
import { cancelRecordingAnalysis, startRecordingAnalysis } from '@/recordings/analysis-service.js';
import { readRecordingAnalysis, writeRecordingAnalysis, writeRecordingTranscript } from '@/recordings/file-store.js';
import { ZERO_USAGE } from '@/utils/usage.js';

let generateTextCalls = 0;

function createHangingAnalysisModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async ({ abortSignal }) => {
      generateTextCalls++;

      return new Promise((_, reject) => {
        abortSignal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
      });
    },
  });
}

setupTestDb();

const recordingId = 'rec_analysis_rerun' as PrefixedString<'rec'>;
const analysisId = 'recan_analysis_rerun' as PrefixedString<'recan'>;
const templateId = 'mnt_analysis_rerun' as PrefixedString<'mnt'>;

async function seedCompletedAnalysis(): Promise<void> {
  const db = getDb();
  const now = Date.now();

  await db
    .insert(recordings)
    .values({
      id: recordingId,
      title: 'Recording',
      source: 'manual',
      status: 'completed',
      platform: 'manual',
      startedAt: now - 1_000,
      endedAt: now,
    });

  await db
    .insert(meetingNoteTemplates)
    .values({
      id: templateId,
      name: 'Test Template',
      content: '# Notes\n\n## Summary\n- ',
      createdAt: now,
      updatedAt: now,
    });

  await db
    .insert(recordingAnalyses)
    .values({
      id: analysisId,
      recordingId,
      status: 'completed',
      title: 'Existing title',
      templateId,
      error: null,
      transcriptionProviderId: 'transcription-provider',
      transcriptionModelId: 'transcription-model',
      analysisProviderId: 'old-provider',
      analysisModelId: 'old-model',
      usage: ZERO_USAGE,
      costUsd: 1,
      startedAt: now - 500,
      endedAt: now - 100,
      durationMs: 400,
    });

  await writeRecordingTranscript(recordingId, [
    { speaker: 'Speaker', content: 'Existing transcript', startMs: 0, endMs: 5000 },
  ]);
  await writeRecordingAnalysis(recordingId, 'Existing summary');
}

async function readAnalysis() {
  const [analysis] = await getDb().select().from(recordingAnalyses).where(eq(recordingAnalyses.id, analysisId));

  return analysis;
}

async function waitForAnalysisModelCall(): Promise<void> {
  const startedAt = Date.now();

  while (generateTextCalls === 0 && Date.now() - startedAt < 1_000) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('recording analysis reruns', () => {
  beforeEach(async () => {
    internalBus.clear();
    generateTextCalls = 0;
    await seedCompletedAnalysis();
  });

  afterEach(() => {
    internalBus.clear();
  });

  test('keeps completed analysis while a forced rerun is cancelled', async () => {
    const startResult = await startRecordingAnalysis(
      recordingId,
      { force: true, templateId },
      {
        resolveModel: async () =>
          ok({
            providerId: 'openai',
            modelId: 'test-model',
            credentials: { providerId: 'openai', auth: { method: 'api-key', apiKey: 'test-key' } },
          }),
        createProvider: () => () => createHangingAnalysisModel(),
      },
    );

    await waitForAnalysisModelCall();

    expect('data' in startResult).toBe(true);
    expect(generateTextCalls).toBe(1);
    expect(await readAnalysis()).toMatchObject({
      status: 'completed',
      title: 'Existing title',
      analysisProviderId: 'old-provider',
      analysisModelId: 'old-model',
    });
    expect(await readRecordingAnalysis(recordingId)).toBe('Existing summary');

    const cancelResult = await cancelRecordingAnalysis(recordingId);

    expect('data' in cancelResult).toBe(true);
    expect(await readAnalysis()).toMatchObject({
      status: 'completed',
      title: 'Existing title',
      analysisProviderId: 'old-provider',
      analysisModelId: 'old-model',
    });
    expect(await readRecordingAnalysis(recordingId)).toBe('Existing summary');
  });
});
