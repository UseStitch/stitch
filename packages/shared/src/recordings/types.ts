import type { PrefixedString } from '../id/index.js';

export type RecordingStatus = 'recording' | 'completed' | 'failed';

export type MeetingPlatform = 'zoom' | 'teams' | 'slack' | 'discord' | 'google-meet';

export type RecordingPlatform = MeetingPlatform | 'manual';

export type MeetingKind = 'desktop' | 'browser';

export type Recording = {
  id: PrefixedString<'rec'>;
  title: string;
  source: string;
  status: RecordingStatus;
  platform: RecordingPlatform;
  mimeType: string;
  filePath: string;
  fileSizeBytes: number | null;
  durationMs: number | null;
  startedAt: number;
  endedAt: number | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

export type StartRecordingInput = {
  title?: string;
  platform?: RecordingPlatform;
};

export type StartRecordingResponse = {
  recording: Recording;
};

export type StopRecordingResponse = {
  recording: Recording;
};

export type ListRecordingsResponse = {
  recordings: Recording[];
  activeRecordingId: PrefixedString<'rec'> | null;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
