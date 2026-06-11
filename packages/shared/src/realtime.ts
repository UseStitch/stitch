import { STREAM_EVENT_NAMES, type StreamEvents } from './chat/stream-events.js';
import { SESSION_EVENT_NAMES, type SessionEvents } from './chat/session-events.js';
import { RECORDING_EVENT_NAMES, type RecordingEvents } from './recordings/events.js';
import { QUESTION_EVENT_NAMES, type QuestionEvents } from './questions/events.js';
import { PERMISSION_EVENT_NAMES, type PermissionEvents } from './permissions/events.js';

const CONNECTION_EVENT_NAMES = ['heartbeat', 'connected'] as const;

export type ConnectionEvents = {
  heartbeat: { ts: number };
  connected: { ts: number };
};

export type SseEventPayloadMap = ConnectionEvents &
  StreamEvents &
  SessionEvents &
  RecordingEvents &
  QuestionEvents &
  PermissionEvents;

export const SSE_EVENT_NAMES = [
  ...CONNECTION_EVENT_NAMES,
  ...STREAM_EVENT_NAMES,
  ...SESSION_EVENT_NAMES,
  ...RECORDING_EVENT_NAMES,
  ...QUESTION_EVENT_NAMES,
  ...PERMISSION_EVENT_NAMES,
] as const satisfies readonly (keyof SseEventPayloadMap)[];

export type SseEventName = (typeof SSE_EVENT_NAMES)[number];

export type SseHandlers = {
  [K in SseEventName]?: (data: SseEventPayloadMap[K]) => void;
};

export type UseSseResult = {
  isConnected: boolean;
  lastHeartbeat: Date | null;
};
