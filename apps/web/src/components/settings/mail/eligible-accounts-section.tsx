import { MailIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { SimpleIcon } from '@/components/ui/simple-icon';
import { getErrorMessage } from '@/lib/errors';
import { useEnrollMailAccount } from '@/lib/mutations/mail';
import { eligibleMailAccountsQueryOptions } from '@/lib/queries/mail';

export function EligibleAccountsSection() {
  const { data: eligibleAccounts, isLoading, error } = useQuery(eligibleMailAccountsQueryOptions);
  const enrollMutation = useEnrollMailAccount();

  function handleEnroll(connectorInstanceId: string) {
    void enrollMutation.mutateAsync({ connectorInstanceId }).catch((caught: unknown) => {
      toast.error(getErrorMessage(caught, 'Failed to enroll mail account'), {
        id: `mail-enroll-${connectorInstanceId}`,
      });
    });
  }

  if (isLoading) return <Text tone="muted">Loading eligible accounts...</Text>;
  if (error) return <Text tone="destructive">{getErrorMessage(error, 'Failed to load eligible accounts')}</Text>;

  if (!eligibleAccounts || eligibleAccounts.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailIcon />
          </EmptyMedia>
          <EmptyTitle>No eligible Google accounts</EmptyTitle>
          <EmptyDescription>
            Connect Google with Gmail scopes before enrolling an account for mail sync.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            to="/connectors"
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-space-m text-sm font-medium text-primary-foreground transition-colors hover:brightness-95">
            Open connectors
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <Stack>
      {eligibleAccounts.map((account) => (
        <div
          key={account.connectorInstanceId}
          className="-mx-space-m flex items-center justify-between border-b border-border-subtle px-space-m py-space-l last:border-0">
          <div className="flex min-w-0 items-center gap-space-xl">
            <div className="shrink-0">
              <Text as="span" tone="muted">
                <SimpleIcon slug="gmail" className="size-5 bg-foreground" fallback={<Icon as={MailIcon} size="l" />} />
              </Text>
            </div>
            <div className="flex min-w-0 flex-col gap-space-xs">
              <Text as="span" variant="body-strong" truncate>
                {account.email}
              </Text>
              <Text variant="caption" tone="muted" truncate>
                Connected Google account
              </Text>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-space-xl shrink-0"
            disabled={enrollMutation.isPending}
            onClick={() => handleEnroll(account.connectorInstanceId)}>
            <Text as="div" tone="muted">
              <Icon as={PlusIcon} size="s" />
            </Text>
            Enroll
          </Button>
        </div>
      ))}
    </Stack>
  );
}
