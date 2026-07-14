import type { PrefixedString } from '../id/index.js';

type SessionTitleUpdatePayload = { sessionId: PrefixedString<'ses'>; title: string };

type SessionTodosUpdatedPayload = { sessionId: PrefixedString<'ses'> };

type CompactionStartPayload = { sessionId: PrefixedString<'ses'>; messageId: PrefixedString<'msg'> };

type CompactionCompletePayload = { sessionId: PrefixedString<'ses'>; summaryMessageId: PrefixedString<'msg'> };

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
