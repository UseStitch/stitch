import { desc, eq, inArray } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';
import type { RecordingPlatform, RecordingStatus } from '@stitch/shared/recordings/types';

import { getDb } from '@/db/client.js';
import { recordingAnalyses, recordings } from '@/db/schema.js';

type SearchRecordingsInput = {
  query?: string;
  limit: number;
  statuses?: RecordingStatus[];
  platforms?: RecordingPlatform[];
};

type RecordingSearchHit = {
  recordingId: PrefixedString<'rec'>;
  title: string;
  status: RecordingStatus;
  platform: RecordingPlatform;
  durationMs: number | null;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
  analysis: {
    status: 'pending' | 'processing' | 'completed' | 'failed' | null;
    title: string | null;
  };
  relevance: number;
  snippet: string;
};

const MAX_SCAN_ROWS = 250;
const MAX_SNIPPET_CHARS = 260;

function normalizeText(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

function toSearchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function scoreField(text: string, queryLower: string, tokens: string[]): number {
  if (!text) {
    return 0;
  }

  const normalized = text.toLowerCase();
  let score = 0;

  if (queryLower && normalized.includes(queryLower)) {
    score += 6;
  }
  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function buildSnippet(candidates: string[], queryLower: string): string {
  const merged = normalizeText(candidates.find((text) => text.trim().length > 0) ?? '');
  if (!merged) {
    return '';
  }

  if (!queryLower) {
    return merged.slice(0, MAX_SNIPPET_CHARS);
  }

  const lower = merged.toLowerCase();
  const idx = lower.indexOf(queryLower);
  if (idx < 0) {
    return merged.slice(0, MAX_SNIPPET_CHARS);
  }

  const start = Math.max(0, idx - 80);
  return merged.slice(start, start + MAX_SNIPPET_CHARS);
}

export async function searchRecordings(input: SearchRecordingsInput): Promise<RecordingSearchHit[]> {
  const db = getDb();

  const baseRows = await db
    .select({
      recording: recordings,
      analysis: recordingAnalyses,
    })
    .from(recordings)
    .leftJoin(recordingAnalyses, eq(recordings.id, recordingAnalyses.recordingId))
    .orderBy(desc(recordings.createdAt))
    .limit(MAX_SCAN_ROWS);

  const statusSet = input.statuses ? new Set(input.statuses) : null;
  const platformSet = input.platforms ? new Set(input.platforms) : null;

  const filteredRows = baseRows.filter((row) => {
    if (statusSet && !statusSet.has(row.recording.status)) {
      return false;
    }
    if (platformSet && !platformSet.has(row.recording.platform)) {
      return false;
    }
    return true;
  });

  const query = normalizeText(input.query ?? '');
  const queryLower = query.toLowerCase();
  const tokens = toSearchTokens(query);
  const now = Date.now();

  const hits: RecordingSearchHit[] = [];
  for (const row of filteredRows) {
    const transcriptText = (row.analysis?.transcript ?? [])
      .slice(0, 24)
      .map((entry) => `${entry.speaker}: ${entry.content}`)
      .join(' ');
    const summaryText = row.analysis?.summary ?? '';
    const analysisTitle = row.analysis?.title ?? '';

    if (!query) {
      hits.push({
        recordingId: row.recording.id,
        title: row.recording.title,
        status: row.recording.status,
        platform: row.recording.platform,
        durationMs: row.recording.durationMs,
        startedAt: row.recording.startedAt,
        endedAt: row.recording.endedAt,
        createdAt: row.recording.createdAt,
        analysis: {
          status: row.analysis?.status ?? null,
          title: analysisTitle || null,
        },
        relevance: 0,
        snippet: buildSnippet([summaryText, transcriptText], ''),
      });
      continue;
    }

    const titleScore = scoreField(row.recording.title, queryLower, tokens) * 1.4;
    const analysisTitleScore = scoreField(analysisTitle, queryLower, tokens) * 1.2;
    const summaryScore = scoreField(summaryText, queryLower, tokens) * 1.1;
    const transcriptScore = scoreField(transcriptText, queryLower, tokens);
    const total = titleScore + analysisTitleScore + summaryScore + transcriptScore;

    if (total <= 0) {
      continue;
    }

    const ageDays = Math.max(0, (now - row.recording.createdAt) / (1000 * 60 * 60 * 24));
    const recencyBoost = Math.max(0, 1.5 - ageDays / 20);

    hits.push({
      recordingId: row.recording.id,
      title: row.recording.title,
      status: row.recording.status,
      platform: row.recording.platform,
      durationMs: row.recording.durationMs,
      startedAt: row.recording.startedAt,
      endedAt: row.recording.endedAt,
      createdAt: row.recording.createdAt,
      analysis: {
        status: row.analysis?.status ?? null,
        title: analysisTitle || null,
      },
      relevance: Number((total + recencyBoost).toFixed(2)),
      snippet: buildSnippet([summaryText, transcriptText, row.recording.title], queryLower),
    });
  }

  return hits
    .sort((a, b) => {
      if (b.relevance !== a.relevance) {
        return b.relevance - a.relevance;
      }
      return b.createdAt - a.createdAt;
    })
    .slice(0, input.limit);
}

export async function getRecordingAnalysesByIds(recordingIds: PrefixedString<'rec'>[]): Promise<
  Array<{
    recordingId: PrefixedString<'rec'>;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    title: string;
    summary: string;
    topics: Array<{ name: string; startTurn: number; endTurn: number }>;
    actionItems: Array<{
      task: string;
      assignee: string | null;
      dueDate: string | null;
      status: 'todo' | 'in_progress' | 'done' | 'unknown';
      topicName: string | null;
    }>;
    blockers: Array<{
      description: string;
      assignee: string | null;
      impact: string | null;
      topicName: string | null;
    }>;
    error: string | null;
    updatedAt: number;
  }>
> {
  if (recordingIds.length === 0) {
    return [];
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(recordingAnalyses)
    .where(inArray(recordingAnalyses.recordingId, recordingIds));

  return rows.map((row) => ({
    recordingId: row.recordingId,
    status: row.status,
    title: row.title,
    summary: row.summary,
    topics: row.topics ?? [],
    actionItems: row.actionItems ?? [],
    blockers: row.blockers ?? [],
    error: row.error,
    updatedAt: row.updatedAt,
  }));
}
