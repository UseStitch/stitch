import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { recordingAnalyses, recordings } from '@/db/schema/recordings.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { ok } from '@/lib/service-result.js';
import { cancelRecordingAnalysis, startRecordingAnalysis } from '@/recordings/analysis-service.js';
import { ZERO_USAGE } from '@/utils/usage.js';

let generateTextCalls = 0;

function createHangingAnalysisModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async ({ abortSignal }) => {
      generateTextCalls++;

      return new Promise((_, reject) => {
        abortSignal?.addEventListener('abort', () => reject(new Error('Aborted')), {
          once: true,
        });
      });
    },
  });
}

setupTestDb();

const recordingId = 'rec_analysis_rerun' as PrefixedString<'rec'>;
const analysisId = 'recan_analysis_rerun' as PrefixedString<'recan'>;

async function seedCompletedAnalysis(): Promise<void> {
  const db = getDb();
  const now = Date.now();

  await db.insert(recordings).values({
    id: recordingId,
    title: 'Recording',
    source: 'manual',
    status: 'completed',
    platform: 'manual',
    mimeType: 'audio/ogg',
    filePath: 'recording.ogg',
    startedAt: now - 1_000,
    endedAt: now,
  });

  await db.insert(recordingAnalyses).values({
    id: analysisId,
    recordingId,
    status: 'completed',
    transcript: [{ speaker: 'Speaker', content: 'Existing transcript', startMs: 0, endMs: 5000 }],
    topicSections: [
      {
        name: 'Existing Topic',
        analysis: 'Existing topic analysis',
        decisions: ['Existing decision'],
        actionItems: [],
        blockers: [],
        openQuestions: [],
        nextSteps: [],
      },
    ],
    summary: 'Existing summary',
    title: 'Existing title',
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
}

async function readAnalysis() {
  const [analysis] = await getDb()
    .select()
    .from(recordingAnalyses)
    .where(eq(recordingAnalyses.id, analysisId));

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
    generateTextCalls = 0;
    await seedCompletedAnalysis();
  });

  test('keeps completed analysis while a forced rerun is cancelled', async () => {
    const startResult = await startRecordingAnalysis(
      recordingId,
      { force: true },
      {
        resolveModel: async () =>
          ok({
            providerId: 'test-provider',
            modelId: 'test-model',
            credentials: {
              providerId: 'openai',
              auth: { method: 'api-key', apiKey: 'test-key' },
            },
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
      summary: 'Existing summary',
      analysisProviderId: 'old-provider',
      analysisModelId: 'old-model',
    });

    const cancelResult = await cancelRecordingAnalysis(recordingId);

    expect('data' in cancelResult).toBe(true);
    expect(await readAnalysis()).toMatchObject({
      status: 'completed',
      title: 'Existing title',
      summary: 'Existing summary',
      analysisProviderId: 'old-provider',
      analysisModelId: 'old-model',
    });
  });
});
