import * as React from 'react';

import { createFileRoute } from '@tanstack/react-router';

import type { MailAccountView } from '@stitch/shared/mail/types';

import { MailPage } from '@/components/mail/mail-page';
import { Text } from '@/components/primitives/text';
import {
  getDefaultMailLabel,
  mailAccountsQueryOptions,
  mailLabelsQueryOptions,
  mailThreadsInfiniteQueryOptions,
} from '@/lib/queries/mail';

export const Route = createFileRoute('/mail/')({
  loader: async ({ context }) => {
    const accounts = await context.queryClient.ensureQueryData(mailAccountsQueryOptions);
    const account = accounts[0] as MailAccountView | undefined;
    if (!account) return;

    const labels = await context.queryClient.ensureQueryData(mailLabelsQueryOptions(account.id));
    const labelId = getDefaultMailLabel(labels)?.id ?? null;
    await context.queryClient.ensureInfiniteQueryData(mailThreadsInfiniteQueryOptions(account.id, labelId));
  },
  component: () => (
    <React.Suspense
      fallback={
        <div className="p-space-xl">
          <Text tone="muted">Loading mail...</Text>
        </div>
      }>
      <MailPage />
    </React.Suspense>
  ),
});
