import type { PrefixedString } from '../id/index.js';

export type SessionTitleUpdatePayload = {
  sessionId: PrefixedString<'ses'>;
  title: string;
};

export type SessionTodosUpdatedPayload = {
  sessionId: PrefixedString<'ses'>;
};

export type CompactionStartPayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
};

export type CompactionCompletePayload = {
  sessionId: PrefixedString<'ses'>;
  summaryMessageId: PrefixedString<'msg'>;
};

export const SESSION_EVENT_NAMES = [
  'session-title-update',
  'session-todos-updated',
  'compaction-start',
  'compaction-complete',
] as const;

export type SessionEvents = {
  'session-title-update': SessionTitleUpdatePayload;
  'session-todos-updated': SessionTodosUpdatedPayload;
  'compaction-start': CompactionStartPayload;
  'compaction-complete': CompactionCompletePayload;
};
