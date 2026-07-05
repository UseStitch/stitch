import type { MeetingKind, MeetingPlatform } from './types.js';

export type MeetingCallDetectedPayload = {
  key: string;
  platform: MeetingPlatform;
  kind: MeetingKind;
  displayName: string;
  processNames: string[];
  windowTitle: string | null;
  detectedAt: number;
};

export type MeetingCallEndedPayload = { key: string; endedAt: number };
