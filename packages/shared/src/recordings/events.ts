import type { PrefixedString } from '../id/index.js';
import type { RecordingAnalysisStatus } from './types.js';

export type RecordingAnalysisUpdatedPayload = {
  recordingId: PrefixedString<'rec'>;
  status: RecordingAnalysisStatus;
  title: string | null;
};

export type RecordingWarningPayload = {
  code: string;
  message: string;
};

export type RecordingDeviceChangedPayload = {
  kind: 'input' | 'output' | 'list';
  deviceName: string | null;
};

export type RecordingStartedPayload = {
  recordingId: PrefixedString<'rec'>;
};

export type RecordingStoppedPayload = {
  recordingId: PrefixedString<'rec'>;
};

export type RecordingUnrecoverablePayload = {
  recordingId: PrefixedString<'rec'>;
  reason: string;
};

export type RecordingTranscriptEntryPayload = {
  recordingId: string;
  kind: 'partial' | 'final';
  source: 'mic' | 'speaker';
  speaker: string;
  content: string;
  /** Milliseconds since recording start — use for ordering instead of client wall-clock */
  offsetMs: number;
};

export const RECORDING_EVENT_NAMES = [
  'recording-analysis-updated',
  'recording-transcript-entry',
  'recording-started',
  'recording-stopped',
  'recording-unrecoverable',
] as const;

export type RecordingEvents = {
  'recording-analysis-updated': RecordingAnalysisUpdatedPayload;
  'recording-transcript-entry': RecordingTranscriptEntryPayload;
  'recording-started': RecordingStartedPayload;
  'recording-stopped': RecordingStoppedPayload;
  'recording-unrecoverable': RecordingUnrecoverablePayload;
};
