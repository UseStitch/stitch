import type { PrefixedString } from '../id/index.js';

export type MeetingStatus = 'detected' | 'recording' | 'completed' | 'dismissed';

export type Meeting = {
  id: PrefixedString<'rec'>;
  app: string;
  appPath: string;
  status: MeetingStatus;
  micFilePath: string | null;
  speakerFilePath: string | null;
  durationSecs: number | null;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
};
