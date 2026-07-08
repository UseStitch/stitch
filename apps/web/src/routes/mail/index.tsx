import * as React from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { MailPage } from '@/components/mail/mail-page';
import {
  getDefaultMailLabel,
  mailAccountsQueryOptions,
  mailLabelsQueryOptions,
  mailThreadsInfiniteQueryOptions,
} from '@/lib/queries/mail';

export const Route = createFileRoute('/mail/')({
  loader: async ({ context }) => {
    const accounts = await context.queryClient.ensureQueryData(mailAccountsQueryOptions);
    const account = accounts[0];
    if (!account) return;

    const labels = await context.queryClient.ensureQueryData(mailLabelsQueryOptions(account.id));
    const labelId = getDefaultMailLabel(labels)?.id ?? null;
    await context.queryClient.ensureInfiniteQueryData(mailThreadsInfiniteQueryOptions(account.id, labelId));
  },
  component: () => (
    <React.Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading mail...</div>}>
      <MailPage />
    </React.Suspense>
  ),
});
