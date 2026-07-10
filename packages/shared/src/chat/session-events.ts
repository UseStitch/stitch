import type { PrefixedString } from '../id/index.js';

export type SessionTitleUpdatePayload = { sessionId: PrefixedString<'ses'>; title: string };

export type SessionTodosUpdatedPayload = { sessionId: PrefixedString<'ses'> };

export type CompactionStartPayload = { sessionId: PrefixedString<'ses'>; messageId: PrefixedString<'msg'> };

export type CompactionCompletePayload = { sessionId: PrefixedString<'ses'>; summaryMessageId: PrefixedString<'msg'> };

export const SESSION_EVENT_NAMES = [
  'session.title.updated',
  'session.todos.updated',
  'session.compaction.started',
  'session.compaction.completed',
] as const;

export type SessionEvents = {
  'session.title.updated': SessionTitleUpdatePayload;
  'session.todos.updated': SessionTodosUpdatedPayload;
  'session.compaction.started': CompactionStartPayload;
  'session.compaction.completed': CompactionCompletePayload;
};
