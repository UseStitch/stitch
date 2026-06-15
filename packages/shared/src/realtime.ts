import { SESSION_EVENT_NAMES, type SessionEvents } from './chat/session-events.js';
import { STREAM_EVENT_NAMES, type StreamEvents } from './chat/stream-events.js';
import { PERMISSION_EVENT_NAMES, type PermissionEvents } from './permissions/events.js';
import { QUESTION_EVENT_NAMES, type QuestionEvents } from './questions/events.js';
import { RECORDING_EVENT_NAMES, type RecordingEvents } from './recordings/events.js';

const MCP_EVENT_NAMES = ['mcp-tools-changed'] as const;

const CONNECTION_EVENT_NAMES = ['heartbeat', 'connected'] as const;

export type ConnectionEvents = {
  heartbeat: { ts: number };
  connected: { ts: number };
};

export type McpEvents = {
  'mcp-tools-changed': { serverId: string; serverName: string; toolCount: number | null };
};

export type SseEventPayloadMap = ConnectionEvents &
  StreamEvents &
  SessionEvents &
  RecordingEvents &
  QuestionEvents &
  PermissionEvents &
  McpEvents;

export const SSE_EVENT_NAMES = [
  ...CONNECTION_EVENT_NAMES,
  ...STREAM_EVENT_NAMES,
  ...SESSION_EVENT_NAMES,
  ...RECORDING_EVENT_NAMES,
  ...QUESTION_EVENT_NAMES,
  ...PERMISSION_EVENT_NAMES,
  ...MCP_EVENT_NAMES,
] as const satisfies readonly (keyof SseEventPayloadMap)[];

export type SseEventName = (typeof SSE_EVENT_NAMES)[number];

export type SseHandlers = {
  [K in SseEventName]?: (data: SseEventPayloadMap[K]) => void;
};

export type UseSseResult = {
  isConnected: boolean;
  lastHeartbeat: Date | null;
};
