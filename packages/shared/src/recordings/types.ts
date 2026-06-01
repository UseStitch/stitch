import type { PrefixedString } from '../id/index.js';

export type RecordingStatus = 'recording' | 'completed' | 'failed';

export type RecordingAnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type MeetingPlatform = 'zoom' | 'teams' | 'slack' | 'discord' | 'google-meet';

export type RecordingPlatform = MeetingPlatform | 'manual';

export type MeetingKind = 'desktop' | 'browser';

export type Recording = {
  id: PrefixedString<'rec'>;
  title: string;
  analysisTitle: string | null;
  source: string;
  status: RecordingStatus;
  platform: RecordingPlatform;
  mimeType: string;
  filePath: string;
  fileSizeBytes: number | null;
  durationMs: number | null;
  costUsd: number | null;
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

export type RecordingTranscriptEntry = {
  speaker: string;
  content: string;
};

export type RecordingActionItem = {
  task: string;
  dueDate: string | null;
  topicName: string | null;
};

export type RecordingBlocker = {
  description: string;
  assignee: string | null;
  impact: string | null;
  topicName: string | null;
};

export type RecordingAnalysisTopicSection = {
  name: string;
  analysis: string;
  decisions: string[];
  actionItems: RecordingActionItem[];
  blockers: RecordingBlocker[];
  openQuestions: string[];
  nextSteps: string[];
};

export type RecordingAnalysis = {
  recordingId: PrefixedString<'rec'>;
  status: RecordingAnalysisStatus;
  transcript: RecordingTranscriptEntry[];
  topicSections: RecordingAnalysisTopicSection[];
  summary: string;
  title: string;
  error: string | null;
  transcriptionProviderId: string | null;
  transcriptionModelId: string | null;
  analysisProviderId: string | null;
  analysisModelId: string | null;
  costUsd: number;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number | null;
};

export type RecordingAnalysisResponse = {
  analysis: RecordingAnalysis | null;
};

export type StartRecordingAnalysisResponse = {
  analysis: RecordingAnalysis;
};
