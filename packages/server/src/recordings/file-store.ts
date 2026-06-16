import fs from 'node:fs/promises';
import path from 'node:path';

import type { PrefixedString } from '@stitch/shared/id';
import type { RecordingTranscriptEntry } from '@stitch/shared/recordings/types';

import { PATHS } from '@/lib/paths.js';

const TRANSCRIPT_FILENAME = 'transcript.json';
const ANALYSIS_FILENAME = 'analysis.md';

function getRecordingDirectory(recordingId: PrefixedString<'rec'>): string {
  return path.join(PATHS.dirPaths.recordings, recordingId);
}

export function getRecordingTranscriptPath(recordingId: PrefixedString<'rec'>): string {
  return path.join(getRecordingDirectory(recordingId), TRANSCRIPT_FILENAME);
}

export function getRecordingAnalysisPath(recordingId: PrefixedString<'rec'>): string {
  return path.join(getRecordingDirectory(recordingId), ANALYSIS_FILENAME);
}

async function ensureRecordingDirectory(recordingId: PrefixedString<'rec'>): Promise<void> {
  await fs.mkdir(getRecordingDirectory(recordingId), { recursive: true });
}

export async function writeRecordingTranscript(
  recordingId: PrefixedString<'rec'>,
  transcript: RecordingTranscriptEntry[],
): Promise<void> {
  await ensureRecordingDirectory(recordingId);
  await fs.writeFile(
    getRecordingTranscriptPath(recordingId),
    `${JSON.stringify(transcript, null, 2)}\n`,
    'utf8',
  );
}

export async function readRecordingTranscript(
  recordingId: PrefixedString<'rec'>,
): Promise<RecordingTranscriptEntry[]> {
  const text = await fs.readFile(getRecordingTranscriptPath(recordingId), 'utf8').catch(() => null);
  if (!text) return [];

  const parsed = JSON.parse(text) as RecordingTranscriptEntry[];
  return Array.isArray(parsed) ? parsed : [];
}

export async function writeRecordingAnalysis(
  recordingId: PrefixedString<'rec'>,
  summary: string,
): Promise<void> {
  await ensureRecordingDirectory(recordingId);
  await fs.writeFile(getRecordingAnalysisPath(recordingId), `${summary.trim()}\n`, 'utf8');
}

export async function readRecordingAnalysis(recordingId: PrefixedString<'rec'>): Promise<string> {
  return (await fs.readFile(getRecordingAnalysisPath(recordingId), 'utf8').catch(() => '')).trim();
}

export async function deleteRecordingFiles(recordingId: PrefixedString<'rec'>): Promise<void> {
  await fs.rm(getRecordingDirectory(recordingId), { recursive: true, force: true });
}
