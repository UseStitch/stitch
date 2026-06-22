import {
  queryOptions,
  infiniteQueryOptions,
  keepPreviousData,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { GeneratedAutomationDraft } from '@stitch/shared/automations/types';
import type {
  Message,
  Session,
  SessionStats,
  MessagesPage,
  SessionsPage,
  LanguageModelUsage,
  StoredPart,
} from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';
import { createMessageId, createPartId } from '@stitch/shared/id';

import { serverRequest } from '@/lib/api';

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
  infiniteList: (search: string) => [...sessionKeys.list(), 'infinite', search] as const,
  detail: (id: string) => [...sessionKeys.all, 'detail', id] as const,
  messages: (id: string) => [...sessionKeys.all, 'messages', id] as const,
  stats: (id: string) => [...sessionKeys.all, 'stats', id] as const,
};

const SESSION_PAGE_SIZE = 30;

export const sessionsInfiniteQueryOptions = (search: string) =>
  infiniteQueryOptions({
    queryKey: sessionKeys.infiniteList(search),
    queryFn: ({ pageParam }): Promise<SessionsPage> => {
      const params = new URLSearchParams({
        type: 'chat',
        limit: String(SESSION_PAGE_SIZE),
      });
      if (search) {
        params.set('q', search);
      }
      if (pageParam !== undefined) {
        params.set('cursor', String(pageParam));
      }

      return serverRequest<SessionsPage>(`/chat/sessions?${params.toString()}`);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage.hasMore || lastPage.sessions.length === 0) return undefined;
      const oldest = lastPage.sessions.at(-1);
      if (!oldest) return undefined;
      if (lastPageParam !== undefined && oldest.createdAt === lastPageParam) return undefined;
      return oldest.createdAt;
    },
    placeholderData: keepPreviousData,
  });

export const sessionQueryOptions = (id: string) =>
  queryOptions({
    queryKey: sessionKeys.detail(id),
    queryFn: () => serverRequest<Session>(`/chat/sessions/${id}`),
  });

function findSessionInListCache(queryClient: QueryClient, id: string): Session | undefined {
  const cacheEntries = queryClient.getQueriesData<InfiniteData<SessionsPage>>({
    queryKey: sessionKeys.list(),
  });
  for (const [, data] of cacheEntries) {
    if (!data) continue;
    for (const page of data.pages) {
      const found = page.sessions.find((s) => s.id === id);
      if (found) return found;
    }
  }
  return undefined;
}

export async function loadSessionRoute(queryClient: QueryClient, id: string): Promise<Session> {
  let session = queryClient.getQueryData<Session>(sessionKeys.detail(id));

  if (!session) {
    const fromList = findSessionInListCache(queryClient, id);
    if (fromList) {
      queryClient.setQueryData(sessionKeys.detail(id), fromList);
      session = fromList;
    }
  }

  if (!session) {
    session = await queryClient.ensureQueryData(sessionQueryOptions(id));
  }

  return session;
}

export const sessionStatsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: sessionKeys.stats(id),
    queryFn: () => serverRequest<SessionStats>(`/chat/sessions/${id}/stats`),
    staleTime: 30_000,
  });

const PAGE_SIZE = 50;

export const sessionMessagesInfiniteQueryOptions = (id: string) =>
  infiniteQueryOptions({
    queryKey: sessionKeys.messages(id),
    queryFn: ({ pageParam }): Promise<MessagesPage> => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pageParam !== undefined) {
        params.set('cursor', String(pageParam));
      }
      return serverRequest<MessagesPage>(`/chat/sessions/${id}/messages?${params.toString()}`);
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
  assistantMessageId: PrefixedString<'msg'>;
};

type SendMessageResult = {
  messageId: PrefixedString<'msg'>;
  userMessageId: PrefixedString<'msg'>;
};

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSessionInput) =>
      serverRequest<Session>('/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
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

type DoomLoopResponseInput = {
  sessionId: string;
  response: 'continue' | 'stop';
};

export function useRenameSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RenameSessionInput) =>
      serverRequest<Session>(`/chat/sessions/${input.sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.title }),
      }),
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
    mutationFn: (input: SplitSessionInput) =>
      serverRequest<SplitSessionResult>(`/chat/sessions/${input.sessionId}/split/${input.msgId}`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      queryClient.setQueryData<Session[]>(sessionKeys.list(), (prev) =>
        prev ? [...prev, data.session] : [data.session],
      );
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeleteSessionInput) =>
      serverRequest<void>(`/chat/sessions/${input.sessionId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
      queryClient.removeQueries({ queryKey: sessionKeys.detail(input.sessionId) });
      queryClient.removeQueries({ queryKey: sessionKeys.messages(input.sessionId) });
    },
  });
}

export function useMarkSessionRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      serverRequest<void>(`/chat/sessions/${sessionId}/read`, { method: 'PATCH' }).catch((err) => {
        if (err instanceof Error && err.message.includes('status 404')) return;
        throw err;
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
    },
  });
}

export function useRespondDoomLoop() {
  return useMutation({
    mutationFn: (input: DoomLoopResponseInput) =>
      serverRequest<void>(`/chat/sessions/${input.sessionId}/doom-loop-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: input.response }),
      }),
    onError: (error) => {
      console.error('Failed to respond to repeated action:', error);
    },
  });
}

export function useRequestCompaction() {
  return useMutation({
    mutationFn: (sessionId: string) =>
      serverRequest<{ ok: true }>(`/chat/sessions/${sessionId}/compact`, { method: 'POST' }),
  });
}

export function useGenerateAutomationDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      serverRequest<GeneratedAutomationDraft>(`/chat/sessions/${sessionId}/generate-automation`, {
        method: 'POST',
      }),
    onSuccess: (_data, sessionId) => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.messages(sessionId) });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      serverRequest<SendMessageResult>(`/chat/sessions/${input.sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: input.content,
          attachments: input.attachments?.map(({ path, mime, filename }) => ({
            path,
            mime,
            filename,
          })),
          providerId: input.providerId,
          modelId: input.modelId,
          assistantMessageId: input.assistantMessageId,
        }),
      }),
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
          sessionId: input.sessionId,
          role: 'user',
          parts: optimisticParts,
          modelId: input.modelId,
          providerId: input.providerId,
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
