import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';

import type {
  MailAccountId,
  MailAccountView,
  MailAddressView,
  MailDraftId,
  MailDraftView,
  MailLabelId,
  MailLabelView,
  MailMessageId,
  MailMessageView,
  MailSyncPhase,
  MailThreadDetail,
  MailThreadId,
  MailThreadsPage,
} from '@stitch/shared/mail/types';

import { serverRequest } from '@/lib/api';

export const mailKeys = {
  all: ['mail'] as const,
  accounts: () => [...mailKeys.all, 'accounts'] as const,
  eligibleAccounts: () => [...mailKeys.all, 'eligible-accounts'] as const,
  syncStatus: () => [...mailKeys.all, 'sync-status'] as const,
};

type EligibleMailAccountView = { connectorInstanceId: string; email: string };

export type MailSyncStatusView = {
  accountId: MailAccountId;
  syncPhase: MailSyncPhase;
  progress?: { processed: number; estimatedTotal: number };
  lastSyncedAt: number | null;
  lastError: string | null;
};

const ACTIVE_SYNC_PHASES = new Set<MailSyncPhase>(['backfill', 'reconciling']);

export const mailAccountsQueryOptions = queryOptions({
  queryKey: mailKeys.accounts(),
  queryFn: () => serverRequest<MailAccountView[]>('/mail/accounts'),
});

export const eligibleMailAccountsQueryOptions = queryOptions({
  queryKey: mailKeys.eligibleAccounts(),
  queryFn: () => serverRequest<EligibleMailAccountView[]>('/mail/eligible-accounts'),
});

export const mailSyncStatusQueryOptions = queryOptions({
  queryKey: mailKeys.syncStatus(),
  queryFn: () => serverRequest<MailSyncStatusView[]>('/mail/sync/status'),
  refetchInterval: (query) => {
    const statuses = query.state.data;
    if (!statuses) return 5_000;
    return statuses.some((status) => ACTIVE_SYNC_PHASES.has(status.syncPhase)) ? 3_000 : 15_000;
  },
});

export const mailDataKeys = {
  labels: (accountId: MailAccountId) => [...mailKeys.all, 'labels', accountId] as const,
  threads: (accountId: MailAccountId, labelId: MailLabelId | null) =>
    [...mailKeys.all, 'threads', accountId, labelId ?? 'all'] as const,
  thread: (threadId: MailThreadId) => [...mailKeys.all, 'thread', threadId] as const,
  drafts: (accountId: MailAccountId) => [...mailKeys.all, 'drafts', accountId] as const,
};

export function getDefaultMailLabel(labels: MailLabelView[]): MailLabelView | undefined {
  return labels.find((label) => label.providerLabelId.toUpperCase() === 'INBOX') ?? labels.at(0);
}

export function mailLabelsQueryOptions(accountId: MailAccountId) {
  return queryOptions({
    queryKey: mailDataKeys.labels(accountId),
    queryFn: () => serverRequest<MailLabelView[]>(`/mail/accounts/${accountId}/labels`),
  });
}

export function mailThreadsInfiniteQueryOptions(accountId: MailAccountId, labelId: MailLabelId | null) {
  return infiniteQueryOptions({
    queryKey: mailDataKeys.threads(accountId, labelId),
    queryFn: ({ pageParam }) =>
      serverRequest<MailThreadsPage>(`/mail/accounts/${accountId}/threads`, {
        params: { labelId: labelId ?? undefined, cursor: pageParam, limit: 50 },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function mailThreadQueryOptions(threadId: MailThreadId) {
  return queryOptions({
    queryKey: mailDataKeys.thread(threadId),
    queryFn: () => serverRequest<MailThreadDetail>(`/mail/threads/${threadId}`),
  });
}

// --- Mutations ---

type EnrollMailAccountInput = { connectorInstanceId: string; backfillDays?: number; syncFrequencySeconds?: number };

type UpdateMailAccountInput = {
  id: MailAccountId;
  enabled?: boolean;
  syncFrequencySeconds?: number;
  backfillDays?: number;
};

type ResyncMailAccountInput = { id: MailAccountId; mode: 'full' | 'incremental' };

function jsonRequestInit(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

type ModifyMailMessageInput = {
  id: MailMessageId;
  accountId: MailAccountId;
  threadId: MailThreadId;
  addLabelIds?: MailLabelId[];
  removeLabelIds?: MailLabelId[];
  markRead?: boolean;
};

type MailDraftInput = {
  accountId: MailAccountId;
  to: MailAddressView[];
  cc?: MailAddressView[];
  bcc?: MailAddressView[];
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  inReplyToMessageId?: MailMessageId | null;
};

type UpdateMailDraftInput = Partial<MailDraftInput> & { id: MailDraftId; accountId: MailAccountId };

function markThreadReadInLists(
  pages: InfiniteData<MailThreadsPage> | undefined,
  threadId: MailThreadId,
): InfiniteData<MailThreadsPage> | undefined {
  if (!pages) return pages;
  return {
    ...pages,
    pages: pages.pages.map((page) => ({
      ...page,
      threads: page.threads.map((thread) => (thread.id === threadId ? { ...thread, hasUnread: false } : thread)),
    })),
  };
}

function removeThreadFromLists(
  pages: InfiniteData<MailThreadsPage> | undefined,
  threadId: MailThreadId,
): InfiniteData<MailThreadsPage> | undefined {
  if (!pages) return pages;
  return {
    ...pages,
    pages: pages.pages.map((page) => ({ ...page, threads: page.threads.filter((thread) => thread.id !== threadId) })),
  };
}

export function useEnrollMailAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EnrollMailAccountInput) =>
      serverRequest<MailAccountView>('/mail/accounts', jsonRequestInit('POST', input)),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: mailKeys.accounts() }),
        queryClient.invalidateQueries({ queryKey: mailKeys.eligibleAccounts() }),
        queryClient.invalidateQueries({ queryKey: mailKeys.syncStatus() }),
      ]);
    },
  });
}

export function useUpdateMailAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateMailAccountInput) =>
      serverRequest<MailAccountView>(`/mail/accounts/${id}`, jsonRequestInit('PATCH', input)),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: mailKeys.accounts() }),
        queryClient.invalidateQueries({ queryKey: mailKeys.syncStatus() }),
      ]);
    },
  });
}

export function useRemoveMailAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: MailAccountId) => serverRequest<void>(`/mail/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: mailKeys.accounts() }),
        queryClient.invalidateQueries({ queryKey: mailKeys.eligibleAccounts() }),
        queryClient.invalidateQueries({ queryKey: mailKeys.syncStatus() }),
      ]);
    },
  });
}

export function useResyncMailAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mode }: ResyncMailAccountInput) =>
      serverRequest<void>(`/mail/accounts/${id}/resync`, jsonRequestInit('POST', { mode })),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: mailKeys.accounts() }),
        queryClient.invalidateQueries({ queryKey: mailKeys.syncStatus() }),
      ]);
    },
  });
}

export function useModifyMailMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accountId: _accountId, threadId: _threadId, ...input }: ModifyMailMessageInput) =>
      serverRequest<MailMessageView>(`/mail/messages/${id}/modify`, jsonRequestInit('POST', input)),
    onMutate: ({ accountId, threadId, markRead }) => {
      if (!markRead) return;
      queryClient.setQueriesData<InfiniteData<MailThreadsPage>>(
        { queryKey: [...mailKeys.all, 'threads', accountId] },
        (pages) => markThreadReadInLists(pages, threadId),
      );
    },
    onSettled: (_data, _error, input) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: [...mailKeys.all, 'threads', input.accountId] }),
        queryClient.invalidateQueries({ queryKey: mailDataKeys.thread(input.threadId) }),
        queryClient.invalidateQueries({ queryKey: mailDataKeys.labels(input.accountId) }),
      ]);
    },
  });
}

export function useTrashMailThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId }: { accountId: MailAccountId; threadId: MailThreadId }) =>
      serverRequest<void>(`/mail/threads/${threadId}/trash`, { method: 'POST' }),
    onMutate: ({ accountId, threadId }) => {
      queryClient.setQueriesData<InfiniteData<MailThreadsPage>>(
        { queryKey: [...mailKeys.all, 'threads', accountId] },
        (pages) => removeThreadFromLists(pages, threadId),
      );
    },
    onSettled: (_data, _error, { accountId, threadId }) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: [...mailKeys.all, 'threads', accountId] }),
        queryClient.invalidateQueries({ queryKey: mailDataKeys.thread(threadId) }),
        queryClient.invalidateQueries({ queryKey: mailDataKeys.labels(accountId) }),
      ]);
    },
  });
}

export function useUntrashMailThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId }: { accountId: MailAccountId; threadId: MailThreadId }) =>
      serverRequest<void>(`/mail/threads/${threadId}/untrash`, { method: 'POST' }),
    onSettled: (_data, _error, { accountId, threadId }) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: [...mailKeys.all, 'threads', accountId] }),
        queryClient.invalidateQueries({ queryKey: mailDataKeys.thread(threadId) }),
        queryClient.invalidateQueries({ queryKey: mailDataKeys.labels(accountId) }),
      ]);
    },
  });
}

export function useCreateMailDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MailDraftInput) => serverRequest<MailDraftView>('/mail/drafts', jsonRequestInit('POST', input)),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: mailDataKeys.drafts(input.accountId) });
    },
  });
}

export function useUpdateMailDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accountId: _accountId, ...input }: UpdateMailDraftInput) =>
      serverRequest<MailDraftView>(`/mail/drafts/${id}`, jsonRequestInit('PATCH', input)),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: mailDataKeys.drafts(input.accountId) });
    },
  });
}

export function useSendMailDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: MailDraftId; accountId: MailAccountId }) =>
      serverRequest<void>(`/mail/drafts/${id}/send`, { method: 'POST' }),
    onSuccess: (_data, input) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: mailDataKeys.drafts(input.accountId) }),
        queryClient.invalidateQueries({ queryKey: [...mailKeys.all, 'threads', input.accountId] }),
        queryClient.invalidateQueries({ queryKey: mailKeys.syncStatus() }),
      ]);
    },
  });
}

export function useSendMailMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MailDraftInput) => serverRequest<void>('/mail/send', jsonRequestInit('POST', input)),
    onSuccess: (_data, input) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: [...mailKeys.all, 'threads', input.accountId] }),
        queryClient.invalidateQueries({ queryKey: mailKeys.syncStatus() }),
      ]);
    },
  });
}
