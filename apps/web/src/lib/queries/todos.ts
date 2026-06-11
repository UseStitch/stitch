import { queryOptions } from '@tanstack/react-query';

import type { SessionTodo } from '@stitch/shared/todos/types';

import { serverRequest } from '@/lib/api';

export const todoKeys = {
  all: ['todos'] as const,
  list: (sessionId: string) => [...todoKeys.all, 'list', sessionId] as const,
};

export function sessionTodosQueryOptions(sessionId: string) {
  return queryOptions({
    queryKey: todoKeys.list(sessionId),
    queryFn: () => serverRequest<SessionTodo[]>(`/chat/sessions/${sessionId}/todos`),
  });
}
