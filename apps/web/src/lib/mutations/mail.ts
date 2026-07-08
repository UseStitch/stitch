import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';

import type {
  MailAccountId,
  MailAccountView,
  MailAddressView,
  MailDraftId,
  MailDraftView,
  MailLabelId,
  MailMessageId,
  MailMessageView,
  MailThreadId,
} from '@stitch/shared/mail/types';

import { serverRequest } from '@/lib/api';
import { mailDataKeys, mailKeys, type MailThreadsPage } from '@/lib/queries/mail';

type EnrollMailAccountInput = {
  connectorInstanceId: string;
  backfillDays?: number;
  syncFrequencySeconds?: number;
};

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
