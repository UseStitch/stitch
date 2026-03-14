import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Message,
  Session,
  SessionWithMessages,
  LanguageModelUsage,
  StoredPart,
} from '@openwork/shared';
import { createMessageId, createPartId } from '@openwork/shared';
import { serverFetch } from '@/lib/api';

export type { SessionWithMessages };

const EMPTY_USAGE: LanguageModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  inputTokenDetails: {
    noCacheTokens: undefined,
    cacheReadTokens: undefined,
    cacheWriteTokens: undefined,
  },
  outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
};

export const sessionKeys = {
  all: ['sessions'] as const,
  list: () => [...sessionKeys.all, 'list'] as const,
  detail: (id: string) => [...sessionKeys.all, 'detail', id] as const,
};

export const sessionsQueryOptions = queryOptions({
  queryKey: sessionKeys.list(),
  staleTime: Infinity,
  queryFn: async (): Promise<Session[]> => {
    const res = await serverFetch('/chat/sessions');
    if (!res.ok) throw new Error('Failed to fetch sessions');
    return res.json() as Promise<Session[]>;
  },
});

export const sessionQueryOptions = (id: string) =>
  queryOptions({
    queryKey: sessionKeys.detail(id),
    queryFn: async (): Promise<SessionWithMessages> => {
      const res = await serverFetch(`/chat/sessions/${id}`);
      if (!res.ok) throw new Error('Failed to fetch session');
      return res.json() as Promise<SessionWithMessages>;
    },
    staleTime: Infinity,
  });

type CreateSessionInput = {
  title?: string;
  parentSessionId?: string;
};

type SendMessageInput = {
  sessionId: string;
  content: string;
  providerId: string;
  modelId: string;
  assistantMessageId: string;
};

type SendMessageResult = {
  messageId: string;
  userMessageId: string;
};

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSessionInput): Promise<Session> => {
      const res = await serverFetch('/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to create session');
      return res.json() as Promise<Session>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
    },
  });
}

type RenameSessionInput = {
  sessionId: string;
  title: string;
};

export function useRenameSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RenameSessionInput): Promise<Session> => {
      const res = await serverFetch(`/chat/sessions/${input.sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.title }),
      });
      if (!res.ok) throw new Error('Failed to rename session');
      return res.json() as Promise<Session>;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.detail(input.sessionId) });
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendMessageInput): Promise<SendMessageResult> => {
      const res = await serverFetch(`/chat/sessions/${input.sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: input.content,
          providerId: input.providerId,
          modelId: input.modelId,
          assistantMessageId: input.assistantMessageId,
        }),
      });
      if (!res.ok) throw new Error('Failed to send message');
      return res.json() as Promise<SendMessageResult>;
    },
    onMutate: async (input) => {
      const queryKey = sessionKeys.detail(input.sessionId);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<SessionWithMessages>(queryKey);

      if (previous) {
        const now = Date.now();
        const optimisticPart: StoredPart = {
          type: 'text-delta' as const,
          id: createPartId(),
          text: input.content,
          startedAt: now,
          endedAt: now,
        };
        const optimisticMessage: Message = {
          id: createMessageId(),
          sessionId: input.sessionId,
          role: 'user',
          parts: [optimisticPart],
          modelId: input.modelId,
          providerId: input.providerId,
          usage: EMPTY_USAGE,
          finishReason: 'stop',
          createdAt: now,
          updatedAt: now,
          startedAt: now,
          duration: null,
        };
        queryClient.setQueryData<SessionWithMessages>(queryKey, {
          ...previous,
          messages: [...previous.messages, optimisticMessage],
        });
      }

      return { previous };
    },
    onError: (_err, input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(sessionKeys.detail(input.sessionId), context.previous);
      }
    },
  });
}
