import { MailIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

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

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading eligible accounts...</p>;
  if (error)
    return <p className="text-sm text-destructive">{getErrorMessage(error, 'Failed to load eligible accounts')}</p>;

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
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Open connectors
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col">
      {eligibleAccounts.map((account) => (
        <div
          key={account.connectorInstanceId}
          className="-mx-2 flex items-center justify-between border-b border-border/50 px-2 py-3 last:border-0">
          <div className="flex min-w-0 items-center gap-4">
            <div className="shrink-0 text-muted-foreground">
              <SimpleIcon slug="gmail" className="size-5 bg-foreground" fallback={<MailIcon className="size-5" />} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[13px] font-semibold text-foreground">{account.email}</span>
              <span className="truncate text-xs text-muted-foreground">Connected Google account</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-4 h-7 shrink-0 rounded-[6px] border-border/60 bg-transparent px-2.5 text-xs font-semibold text-foreground/90 transition-colors hover:bg-muted/50"
            disabled={enrollMutation.isPending}
            onClick={() => handleEnroll(account.connectorInstanceId)}>
            <PlusIcon className="mr-0.75 size-3.5 text-muted-foreground" />
            Enroll
          </Button>
        </div>
      ))}
    </div>
  );
}
