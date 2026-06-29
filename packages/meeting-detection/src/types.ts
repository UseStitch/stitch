import type { StitchLogger } from '@stitch/shared/logger';

export type MeetingPlatform = 'zoom' | 'teams' | 'slack' | 'discord' | 'google-meet';

export type MeetingKind = 'desktop' | 'browser';

export type MeetingDetection = {
  key: string;
  platform: MeetingPlatform;
  kind: MeetingKind;
  displayName: string;
  processNames: string[];
  windowTitle: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
};

export type MeetingDetectedEvent = {
  type: 'detected';
  detection: MeetingDetection;
  detectedAt: number;
};

export type MeetingEndedEvent = {
  type: 'ended';
  key: string;
  endedAt: number;
};

export type MeetingDetectionEvent = MeetingDetectedEvent | MeetingEndedEvent;

export type MeetingDetectionListener = (event: MeetingDetectionEvent) => void;

export type MeetingDetectionOptions = {
  activationThresholdMs?: number;
  cooldownMs?: number;
  endGraceMs?: number;
  minRepromptIntervalMs?: number;
  logger?: StitchLogger;
};

export type MeetingDetector = {
  start: () => void;
  stop: () => void;
  subscribe: (listener: MeetingDetectionListener) => () => void;
  getActive: () => MeetingDetection | null;
  dismiss: (key: string, now?: number) => void;
};
