import { useQueryClient } from '@tanstack/react-query';

import { useSSE } from '@/hooks/sse/sse-context';
import { mailDataKeys, mailKeys, type MailSyncStatusView } from '@/lib/queries/mail';

export function useMailEvents(): void {
  const queryClient = useQueryClient();

  useSSE({
    'mail.threads.changed': ({ accountId, threadIds }) => {
      void queryClient.invalidateQueries({ queryKey: [...mailKeys.all, 'threads', accountId] });
      threadIds.forEach((threadId) => {
        void queryClient.invalidateQueries({ queryKey: mailDataKeys.thread(threadId) });
      });
    },
    'mail.account.updated': () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: mailKeys.accounts() }),
        queryClient.invalidateQueries({ queryKey: mailKeys.syncStatus() }),
      ]);
    },
    'mail.sync.progress': ({ accountId, phase, processed, estimatedTotal }) => {
      queryClient.setQueryData<MailSyncStatusView[]>(mailKeys.syncStatus(), (statuses) =>
        statuses?.map((status) =>
          status.accountId === accountId ? { ...status, syncPhase: phase, progress: { processed, estimatedTotal } } : status,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: mailKeys.syncStatus() });
    },
  });
}
