import type { LanguageModelUsage } from 'ai';

import type { PrefixedString } from '../id/index.js';

export type MeetingStatus = 'detected' | 'recording' | 'completed' | 'dismissed';

export type Meeting = {
  id: PrefixedString<'rec'>;
  app: string;
  appPath: string;
  status: MeetingStatus;
  recordingFilePath: string | null;
  durationSecs: number | null;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type TranscriptionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type Transcription = {
  id: PrefixedString<'transcr'>;
  meetingId: PrefixedString<'rec'>;
  filePath: string;
  transcript: string;
  summary: string;
  title: string;
  status: TranscriptionStatus;
  errorMessage: string | null;
  modelId: string;
  providerId: string;
  usage: LanguageModelUsage | null;
  costUsd: number;
  durationMs: number | null;
  createdAt: number;
  updatedAt: number;
};
