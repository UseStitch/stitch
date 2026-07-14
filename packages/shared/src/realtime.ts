import { SESSION_EVENT_NAMES, type SessionEvents } from './chat/session-events.js';
import { STREAM_EVENT_NAMES, type StreamEvents } from './chat/stream-events.js';
import { CONNECTOR_EVENT_NAMES, type ConnectorEvents } from './connectors/events.js';
import { MAIL_EVENT_NAMES, type MailEvents } from './mail/events.js';
import { MCP_EVENT_NAMES, type McpEvents } from './mcp/events.js';
import { PERMISSION_EVENT_NAMES, type PermissionEvents } from './permissions/events.js';
import { QUESTION_EVENT_NAMES, type QuestionEvents } from './questions/events.js';
import { RECORDING_EVENT_NAMES, type RecordingEvents } from './recordings/events.js';
import { SKILL_EVENT_NAMES, type SkillEvents } from './skills/events.js';

const CONNECTION_EVENT_NAMES = ['heartbeat', 'connected'] as const;

type ConnectionEvents = { heartbeat: { ts: number }; connected: { ts: number } };

export type SseEventPayloadMap = ConnectionEvents &
  StreamEvents &
  SessionEvents &
  RecordingEvents &
  SkillEvents &
  ConnectorEvents &
  QuestionEvents &
  PermissionEvents &
  McpEvents &
  MailEvents;

export const SSE_EVENT_NAMES = [
  ...CONNECTION_EVENT_NAMES,
  ...STREAM_EVENT_NAMES,
  ...SESSION_EVENT_NAMES,
  ...RECORDING_EVENT_NAMES,
  ...SKILL_EVENT_NAMES,
  ...CONNECTOR_EVENT_NAMES,
  ...QUESTION_EVENT_NAMES,
  ...PERMISSION_EVENT_NAMES,
  ...MCP_EVENT_NAMES,
  ...MAIL_EVENT_NAMES,
] as const satisfies readonly (keyof SseEventPayloadMap)[];

export type SseEventName = (typeof SSE_EVENT_NAMES)[number];

// Compile-time exhaustiveness check: ensures every key in SseEventPayloadMap
// is present in SSE_EVENT_NAMES. A type error here means a payload was added
// to SseEventPayloadMap without a corresponding entry in the event names array.
type _AssertExhaustive = keyof SseEventPayloadMap extends SseEventName ? true : never;
const _exhaustiveCheck: _AssertExhaustive = true;
void _exhaustiveCheck;

export type SseHandlers = {
  [K in SseEventName]?: (data: SseEventPayloadMap[K]) => void;
};

export type UseSseResult = { isConnected: boolean; lastHeartbeat: Date | null };
