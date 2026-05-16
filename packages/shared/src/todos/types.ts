import type { PrefixedString } from '../id/index.js';

export const TODO_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
export const TODO_PRIORITIES = ['high', 'medium', 'low'] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

export type SessionTodo = {
  id: PrefixedString<'todo'>;
  sessionId: PrefixedString<'ses'>;
  content: string;
  status: TodoStatus;
  priority: TodoPriority;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type TodoInput = {
  id?: PrefixedString<'todo'>;
  content: string;
  status: TodoStatus;
  priority: TodoPriority;
};
