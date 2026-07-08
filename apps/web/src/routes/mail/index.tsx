import { createFileRoute } from '@tanstack/react-router';

import { MailPage } from '@/components/mail/mail-page';

export const Route = createFileRoute('/mail/')({
  component: MailPage,
});