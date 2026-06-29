type StitchLogger = {
  debug(extra: Record<string, unknown>, message: string): void;
  debug(message: string): void;
  info(extra: Record<string, unknown>, message: string): void;
  info(message: string): void;
  warn(extra: Record<string, unknown>, message: string): void;
  warn(message: string): void;
  error(extra: Record<string, unknown>, message: string): void;
  error(message: string): void;
};

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
  logger?: StitchLogger;
};

export type MeetingDetector = {
  start: () => void;
  stop: () => void;
  subscribe: (listener: MeetingDetectionListener) => () => void;
  getActive: () => MeetingDetection | null;
};
