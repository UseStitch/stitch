import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';

import type {
  MailAccountId,
  MailAccountView,
  MailLabelId,
  MailLabelView,
  MailSyncPhase,
  MailThreadDetail,
  MailThreadId,
  MailThreadListItem,
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

export type MailThreadsPage = { threads: MailThreadListItem[]; nextCursor: string | null };

export const mailDataKeys = {
  labels: (accountId: MailAccountId) => [...mailKeys.all, 'labels', accountId] as const,
  threads: (accountId: MailAccountId, labelId: MailLabelId | null) =>
    [...mailKeys.all, 'threads', accountId, labelId ?? 'all'] as const,
  thread: (threadId: MailThreadId) => [...mailKeys.all, 'thread', threadId] as const,
  drafts: (accountId: MailAccountId) => [...mailKeys.all, 'drafts', accountId] as const,
};

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
