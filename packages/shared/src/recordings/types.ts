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
  durationMs: number | null;
  costUsd: number | null;
  startedAt: number;
  endedAt: number | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

export type MeetingNoteTemplate = {
  id: PrefixedString<'mnt'>;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

export type MeetingNoteTemplateInput = {
  name: string;
  content: string;
};

export type ListMeetingNoteTemplatesResponse = {
  templates: MeetingNoteTemplate[];
};

export type MeetingNoteTemplateResponse = {
  template: MeetingNoteTemplate;
};

export type StartRecordingInput = {
  title?: string;
  platform?: RecordingPlatform;
  sttProviderId?: string;
  sttModelId?: string;
};

export type StartRecordingResponse = {
  recording: Recording;
  recordingId: PrefixedString<'rec'>;
  micDeviceId: string | null;
  speakerDeviceId: string | null;
  speakerGain: number;
  audioChunkConfig: {
    encoding: 'f32le' | 'pcm_s16le';
    sampleRateHz: number;
  };
  stt: {
    providerId: string;
    modelId: string;
  };
};

export type StopRecordingInput = {
  durationMs: number | null;
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
  /** Milliseconds since recording start when this entry began */
  startMs: number;
  /** Milliseconds since recording start when this entry ended */
  endMs: number;
};

export type RecordingActionItem = {
  task: string;
  dueDate: string | null;
  topicName: string | null;
};

export type RecordingBlocker = {
  description: string;
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

export type RecordingDetailsResponse = {
  recording: Recording;
  analysis: RecordingAnalysis | null;
  activeRecordingId: PrefixedString<'rec'> | null;
};

export type ActiveRecordingResponse = {
  activeRecordingId: PrefixedString<'rec'> | null;
};

export type StartRecordingAnalysisResponse = {
  analysis: RecordingAnalysis;
};
