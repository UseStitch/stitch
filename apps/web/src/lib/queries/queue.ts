import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { QueuedMessage, QueuedMessageAttachment } from '@stitch/shared/chat/queue';
import type { PrefixedString } from '@stitch/shared/id';

import { serverFetch } from '@/lib/api';

const queueKeys = {
  all: ['queue'] as const,
  list: (sessionId: string) => [...queueKeys.all, 'list', sessionId] as const,
};

export const queuedMessagesQueryOptions = (sessionId: string) =>
  queryOptions({
    queryKey: queueKeys.list(sessionId),
    queryFn: async (): Promise<QueuedMessage[]> => {
      const res = await serverFetch(`/chat/sessions/${sessionId}/queue`);
      if (!res.ok) throw new Error('Failed to fetch queued messages');
      return res.json() as Promise<QueuedMessage[]>;
    },
    staleTime: Infinity,
  });

type AddToQueueInput = {
  sessionId: PrefixedString<'ses'>;
  content: string;
  attachments?: QueuedMessageAttachment[];
};

export function useAddToQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddToQueueInput): Promise<QueuedMessage> => {
      const res = await serverFetch(`/chat/sessions/${input.sessionId}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: input.content,
          attachments: input.attachments,
        }),
      });
      if (!res.ok) throw new Error('Failed to add to queue');
      return res.json() as Promise<QueuedMessage>;
    },
    onMutate: async (input) => {
      const queryKey = queueKeys.list(input.sessionId);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<QueuedMessage[]>(queryKey);

      const optimistic: QueuedMessage = {
        id: `qmsg_optimistic_${Date.now()}` as PrefixedString<'qmsg'>,
        sessionId: input.sessionId,
        content: input.content,
        attachments: input.attachments ?? [],
        position: (previous?.length ?? 0) + 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      queryClient.setQueryData<QueuedMessage[]>(queryKey, [...(previous ?? []), optimistic]);
      return { previous };
    },
    onError: (_err, input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queueKeys.list(input.sessionId), context.previous);
      }
    },
    onSettled: (_data, _err, input) => {
      void queryClient.invalidateQueries({ queryKey: queueKeys.list(input.sessionId) });
    },
  });
}

type RemoveFromQueueInput = {
  sessionId: PrefixedString<'ses'>;
  queueId: PrefixedString<'qmsg'>;
};

export function useRemoveFromQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RemoveFromQueueInput): Promise<void> => {
      const res = await serverFetch(`/chat/sessions/${input.sessionId}/queue/${input.queueId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove from queue');
    },
    onMutate: async (input) => {
      const queryKey = queueKeys.list(input.sessionId);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<QueuedMessage[]>(queryKey);
      queryClient.setQueryData<QueuedMessage[]>(
        queryKey,
        (previous ?? []).filter((m) => m.id !== input.queueId),
      );
      return { previous };
    },
    onError: (_err, input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queueKeys.list(input.sessionId), context.previous);
      }
    },
    onSettled: (_data, _err, input) => {
      void queryClient.invalidateQueries({ queryKey: queueKeys.list(input.sessionId) });
    },
  });
}
