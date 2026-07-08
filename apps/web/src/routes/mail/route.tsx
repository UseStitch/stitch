import { toast } from 'sonner';

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { useMailEvents } from '@/hooks/sse/use-mail-events';
import { appEnabledStatesQueryOptions } from '@/lib/queries/apps';
import { mailAccountsQueryOptions } from '@/lib/queries/mail';

function MailRoute() {
  useMailEvents();
  return <Outlet />;
}

export const Route = createFileRoute('/mail')({
  loader: async ({ context }) => {
    const appStates = await context.queryClient.ensureQueryData(appEnabledStatesQueryOptions);
    const mailEnabled = appStates.find((state) => state.appId === 'mail')?.enabled ?? true;
    if (!mailEnabled) {
      toast.warning('Mail is disabled. Enable it in Settings > Mail.', { id: 'mail-disabled' });
      throw redirect({ to: '/' });
    }
    await context.queryClient.ensureQueryData(mailAccountsQueryOptions);
  },
  component: MailRoute,
});
