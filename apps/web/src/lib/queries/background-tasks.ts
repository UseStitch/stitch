import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import type { BackgroundTask } from '@stitch/shared/background-tasks/types';
import type { PrefixedString } from '@stitch/shared/id';

import { serverRequest } from '@/lib/api';

export const backgroundTaskKeys = {
  all: ['background-tasks'] as const,
  lists: () => [...backgroundTaskKeys.all, 'list'] as const,
  list: (parentSessionId: string) => [...backgroundTaskKeys.lists(), parentSessionId] as const,
};

export const backgroundTasksQueryOptions = (parentSessionId: string) =>
  queryOptions({
    queryKey: backgroundTaskKeys.list(parentSessionId),
    queryFn: () => serverRequest<BackgroundTask[]>(`/chat/sessions/${parentSessionId}/background-tasks`),
  });

export function updateBackgroundTaskCache(queryClient: QueryClient, task: BackgroundTask): BackgroundTask | undefined {
  const queryKey = backgroundTaskKeys.list(task.parentSessionId);
  const previous = queryClient.getQueryData<BackgroundTask[]>(queryKey);
  const previousTask = previous?.find((item) => item.id === task.id);

  const next = previousTask
    ? previous?.map((item) => (item.id === task.id ? task : item))
    : [task, ...(previous ?? [])];
  queryClient.setQueryData(
    queryKey,
    next?.toSorted((a, b) => b.startedAt - a.startedAt),
  );

  return previousTask;
}

export function useCancelBackgroundTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: PrefixedString<'ses'>) =>
      serverRequest<BackgroundTask>(`/chat/background-tasks/${taskId}/cancel`, { method: 'POST' }),
    onSuccess: (task) => updateBackgroundTaskCache(queryClient, task),
  });
}
