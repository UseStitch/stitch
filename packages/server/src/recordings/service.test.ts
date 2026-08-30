import { describe, expect, test } from 'bun:test';

import { getDb } from '@/db/client.js';
import { recordingAnalyses, recordings } from '@/db/schema/recordings.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { listRecordings } from '@/recordings/service.js';

setupTestDb();

async function insertRecording(input: {
  id: string;
  title: string;
  analysisTitle: string;
  costUsd: number;
  startedAt: number;
}) {
  await getDb()
    .insert(recordings)
    .values({
      id: input.id as never,
      title: input.title,
      source: 'manual',
      status: 'completed',
      platform: 'manual',
      startedAt: input.startedAt,
      createdAt: input.startedAt,
      updatedAt: input.startedAt,
    });
  await getDb()
    .insert(recordingAnalyses)
    .values({
      id: `recan_${input.id}` as never,
      recordingId: input.id as never,
      title: input.analysisTitle,
      costUsd: input.costUsd,
    });
}

describe('listRecordings', () => {
  test('sorts titles by the displayed analysis-title fallback before pagination', async () => {
    await insertRecording({ id: 'rec_a', title: 'Zulu', analysisTitle: 'Alpha', costUsd: 1, startedAt: 1 });
    await insertRecording({ id: 'rec_b', title: 'Bravo', analysisTitle: '', costUsd: 2, startedAt: 2 });
    await insertRecording({ id: 'rec_c', title: 'Charlie', analysisTitle: 'Echo', costUsd: 3, startedAt: 3 });

    const firstPage = await listRecordings({ page: 1, pageSize: 2, sort: 'title', sortDirection: 'asc' });
    const secondPage = await listRecordings({ page: 2, pageSize: 2, sort: 'title', sortDirection: 'asc' });

    expect(firstPage.recordings.map((recording) => recording.id)).toEqual(['rec_a', 'rec_b']);
    expect(secondPage.recordings.map((recording) => recording.id)).toEqual(['rec_c']);
  });

  test('sorts by joined analysis cost with deterministic directional ties', async () => {
    await insertRecording({ id: 'rec_a', title: 'A', analysisTitle: '', costUsd: 5, startedAt: 1 });
    await insertRecording({ id: 'rec_b', title: 'B', analysisTitle: '', costUsd: 5, startedAt: 2 });
    await insertRecording({ id: 'rec_c', title: 'C', analysisTitle: '', costUsd: 1, startedAt: 3 });

    const result = await listRecordings({ page: 1, pageSize: 3, sort: 'costUsd', sortDirection: 'desc' });

    expect(result.recordings.map((recording) => recording.id)).toEqual(['rec_b', 'rec_a', 'rec_c']);
    expect(result.recordings.map((recording) => recording.costUsd)).toEqual([5, 5, 1]);
  });
});
