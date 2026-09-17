import type { PrefixedString } from '../id/index.js';

export type SessionTitleUpdatePayload = { sessionId: PrefixedString<'ses'>; title: string };

type SessionTodosUpdatedPayload = { sessionId: PrefixedString<'ses'> };

export type SessionMessageEventPayload = { sessionId: PrefixedString<'ses'>; messageId: PrefixedString<'msg'> };

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
  'session.compaction.started': SessionMessageEventPayload;
  'session.compaction.completed': CompactionCompletePayload;
};
