import { queryOptions } from '@tanstack/react-query';

import type { SessionTodo } from '@stitch/shared/todos/types';

import { serverFetch } from '@/lib/api';

export const todoKeys = {
  all: ['todos'] as const,
  list: (sessionId: string) => [...todoKeys.all, 'list', sessionId] as const,
};

export function sessionTodosQueryOptions(sessionId: string) {
  return queryOptions({
    queryKey: todoKeys.list(sessionId),
    queryFn: async (): Promise<SessionTodo[]> => {
      const res = await serverFetch(`/chat/sessions/${sessionId}/todos`);
      if (!res.ok) throw new Error('Failed to fetch todos');
      return res.json() as Promise<SessionTodo[]>;
    },
  });
}
