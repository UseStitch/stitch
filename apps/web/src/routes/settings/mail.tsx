import { createFileRoute } from '@tanstack/react-router';

import { MailSettings } from '@/components/settings/mail-settings';
import { appEnabledStatesQueryOptions } from '@/lib/queries/apps';

export const Route = createFileRoute('/settings/mail')({
  loader: ({ context }) => context.queryClient.ensureQueryData(appEnabledStatesQueryOptions),
  component: MailSettings,
});