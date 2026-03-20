import {
  queryOptions,
  infiniteQueryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';

import type { Message, Session, MessagesPage, LanguageModelUsage, StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';
import { createMessageId, createPartId } from '@stitch/shared/id';

import { serverFetch } from '@/lib/api';

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
  messages: (id: string) => [...sessionKeys.all, 'messages', id] as const,
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
    queryFn: async (): Promise<Session> => {
      const res = await serverFetch(`/chat/sessions/${id}`);
      if (!res.ok) throw new Error('Failed to fetch session');
      return res.json() as Promise<Session>;
    },
    staleTime: Infinity,
  });

const PAGE_SIZE = 50;

export const sessionMessagesInfiniteQueryOptions = (id: string) =>
  infiniteQueryOptions({
    queryKey: sessionKeys.messages(id),
    queryFn: async ({ pageParam }): Promise<MessagesPage> => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pageParam !== undefined) {
        params.set('cursor', String(pageParam));
      }
      const res = await serverFetch(`/chat/sessions/${id}/messages?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json() as Promise<MessagesPage>;
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage.hasMore || lastPage.messages.length === 0) return undefined;
      // The cursor is the createdAt of the oldest message in this page
      // (messages are returned chronologically, so oldest is first)
      const oldest = lastPage.messages[0];
      if (!oldest) return undefined;
      // Guard against infinite loops: if cursor hasn't changed, stop
      if (lastPageParam !== undefined && oldest.createdAt === lastPageParam) return undefined;
      return oldest.createdAt;
    },
    staleTime: Infinity,
  });

/** Flatten all pages into a single chronological message array. */
export function flattenMessages(data: InfiniteData<MessagesPage> | undefined): Message[] {
  if (!data) return [];
  // Pages are stored newest-first (page 0 = most recent, page N = oldest).
  // Each page's messages are already in chronological order.
  // To get a full chronological list: reverse the pages array, then flatten.
  const reversed = [...data.pages].reverse();
  return reversed.flatMap((page) => page.messages);
}

type CreateSessionInput = {
  title?: string;
  parentSessionId?: string;
};

type Attachment = {
  path: string;
  previewUrl: string | null;
  mime: string;
  filename: string;
};

type SendMessageInput = {
  sessionId: PrefixedString<'ses'>;
  content: string;
  attachments?: Attachment[];
  providerId: string;
  modelId: string;
  agentId: PrefixedString<'agt'>;
  assistantMessageId: PrefixedString<'msg'>;
};

type SendMessageResult = {
  messageId: PrefixedString<'msg'>;
  userMessageId: PrefixedString<'msg'>;
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
  sessionId: PrefixedString<'ses'>;
  title: string;
};

type DeleteSessionInput = {
  sessionId: PrefixedString<'ses'>;
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

type SplitSessionInput = {
  sessionId: PrefixedString<'ses'>;
  msgId: PrefixedString<'msg'>;
};

type SplitSessionResult = {
  session: Session;
  prefillText: string;
};

export function useSplitSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SplitSessionInput): Promise<SplitSessionResult> => {
      const res = await serverFetch(`/chat/sessions/${input.sessionId}/split/${input.msgId}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to split session');
      return res.json() as Promise<SplitSessionResult>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DeleteSessionInput): Promise<void> => {
      const res = await serverFetch(`/chat/sessions/${input.sessionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete session');
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
      queryClient.removeQueries({ queryKey: sessionKeys.detail(input.sessionId) });
      queryClient.removeQueries({ queryKey: sessionKeys.messages(input.sessionId) });
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
          attachments: input.attachments?.map(({ path, mime, filename }) => ({ path, mime, filename })),
          providerId: input.providerId,
          modelId: input.modelId,
          agentId: input.agentId,
          assistantMessageId: input.assistantMessageId,
        }),
      });
      if (!res.ok) throw new Error('Failed to send message');
      return res.json() as Promise<SendMessageResult>;
    },
    onMutate: async (input) => {
      const queryKey = sessionKeys.messages(input.sessionId);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<InfiniteData<MessagesPage>>(queryKey);

      if (previous) {
        const now = Date.now();
        const optimisticParts: StoredPart[] = [
          {
            type: 'text-delta' as const,
            id: createPartId(),
            text: input.content,
            startedAt: now,
            endedAt: now,
          },
          ...(input.attachments ?? []).map((att): StoredPart => {
            if (att.mime.startsWith('image/')) {
              return {
                type: 'user-image' as const,
                id: createPartId(),
                dataUrl: att.previewUrl ?? '',
                mime: att.mime,
                filename: att.filename,
                startedAt: now,
                endedAt: now,
              };
            }
            if (att.mime === 'application/pdf') {
              return {
                type: 'user-file' as const,
                id: createPartId(),
                dataUrl: '',
                mime: att.mime,
                filename: att.filename,
                startedAt: now,
                endedAt: now,
              };
            }
            return {
              type: 'user-text-file' as const,
              id: createPartId(),
              content: '',
              mime: att.mime,
              filename: att.filename,
              startedAt: now,
              endedAt: now,
            };
          }),
        ];

        const optimisticMessage: Message = {
          id: createMessageId(),
          sessionId: input.sessionId as PrefixedString<'ses'>,
          role: 'user',
          parts: optimisticParts,
          modelId: input.modelId,
            providerId: input.providerId,
            agentId: input.agentId as PrefixedString<'agt'>,
            usage: EMPTY_USAGE,
            costUsd: null,
            finishReason: 'stop',
          isSummary: false,
          createdAt: now,
          updatedAt: now,
          startedAt: now,
          duration: null,
        };

        // Append the optimistic message to the first page (most recent)
        const updatedPages = [...previous.pages];
        const firstPage = updatedPages[0];
        if (firstPage) {
          updatedPages[0] = {
            ...firstPage,
            messages: [...firstPage.messages, optimisticMessage],
          };
        }

        queryClient.setQueryData<InfiniteData<MessagesPage>>(queryKey, {
          ...previous,
          pages: updatedPages,
        });
      }

      return { previous };
    },
    onError: (_err, input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(sessionKeys.messages(input.sessionId), context.previous);
      }
    },
  });
}
