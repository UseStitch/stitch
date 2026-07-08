import { AlertCircleIcon, MailIcon, RefreshCwIcon, TrashIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import type { MailAccountView, MailSyncPhase } from '@stitch/shared/mail/types';

import { AppEnableSetting } from '@/components/settings/app-enable-setting';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import {
  SettingPage,
  SettingRow,
  SettingRowControl,
  SettingRows,
  SettingSection,
} from '@/components/settings/settings-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/errors';
import {
  useEnrollMailAccount,
  useRemoveMailAccount,
  useResyncMailAccount,
  useUpdateMailAccount,
} from '@/lib/mutations/mail';
import {
  eligibleMailAccountsQueryOptions,
  mailAccountsQueryOptions,
  mailSyncStatusQueryOptions,
  type MailSyncStatusView,
} from '@/lib/queries/mail';
import { cn } from '@/lib/utils';

const SYNC_PHASE_LABELS: Record<MailSyncPhase, string> = {
  idle: 'Idle',
  backfill: 'Backfilling',
  incremental: 'Incremental',
  reconciling: 'Reconciling',
  error: 'Error',
};

const SYNC_PHASE_CLASSES: Record<MailSyncPhase, string> = {
  idle: 'border-border text-muted-foreground',
  backfill: 'border-warning/30 bg-warning/10 text-warning',
  incremental: 'border-success/30 bg-success/10 text-success',
  reconciling: 'border-warning/30 bg-warning/10 text-warning',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
};

function formatLastSyncedAt(value: number | null): string {
  if (value === null) return 'Never';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function getStatusForAccount(account: MailAccountView, statuses: MailSyncStatusView[] | undefined): MailSyncStatusView {
  const status = statuses?.find((item) => item.accountId === account.id);
  return {
    accountId: account.id,
    syncPhase: status?.syncPhase ?? account.syncPhase,
    progress: status?.progress,
    lastSyncedAt: status ? status.lastSyncedAt : account.lastSyncedAt,
    lastError: status ? status.lastError : account.lastError,
  };
}

function MailNumberInput({
  value,
  min,
  id,
  disabled,
  onSave,
}: {
  value: number;
  min: number;
  id: string;
  disabled: boolean;
  onSave: (value: number) => void;
}) {
  const [localValue, setLocalValue] = React.useState(String(value));

  React.useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  function handleBlur() {
    const nextValue = Math.max(min, Number.parseInt(localValue, 10));
    if (!Number.isFinite(nextValue)) {
      setLocalValue(String(value));
      return;
    }
    setLocalValue(String(nextValue));
    if (nextValue !== value) onSave(nextValue);
  }

  return (
    <Input
      id={id}
      type="number"
      min={String(min)}
      value={localValue}
      disabled={disabled}
      onChange={(event) => setLocalValue(event.target.value)}
      onBlur={handleBlur}
    />
  );
}

function SyncPhaseBadge({ phase }: { phase: MailSyncPhase }) {
  return (
    <Badge variant="outline" className={cn('capitalize', SYNC_PHASE_CLASSES[phase])}>
      {SYNC_PHASE_LABELS[phase]}
    </Badge>
  );
}

function SyncProgress({ status }: { status: MailSyncStatusView }) {
  const progress = status.progress;
  if (status.syncPhase !== 'backfill' || !progress || progress.estimatedTotal <= 0) return null;

  const percent = Math.min(100, Math.round((progress.processed / progress.estimatedTotal) * 100));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Backfill progress</span>
        <span className="tabular-nums">
          {progress.processed.toLocaleString()} / {progress.estimatedTotal.toLocaleString()}
        </span>
      </div>
      <Progress value={percent} aria-label="Backfill progress" />
    </div>
  );
}

function AccountErrorBanner({ account, error }: { account: MailAccountView; error: string }) {
  const resyncMutation = useResyncMailAccount();

  function handleRetry() {
    void resyncMutation.mutateAsync({ id: account.id, mode: 'incremental' }).catch((caught: unknown) => {
      toast.error(getErrorMessage(caught, 'Failed to retry sync'), { id: `mail-retry-${account.id}` });
    });
  }

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-2">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">Sync error</p>
            <p className="mt-1 text-xs wrap-break-word text-destructive/90">{error}</p>
          </div>
        </div>
        <Button variant="destructive" size="sm" disabled={resyncMutation.isPending} onClick={handleRetry}>
          {resyncMutation.isPending ? 'Retrying...' : 'Retry'}
        </Button>
      </div>
    </div>
  );
}

function MailAccountCard({ account, status }: { account: MailAccountView; status: MailSyncStatusView }) {
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const updateMutation = useUpdateMailAccount();
  const removeMutation = useRemoveMailAccount();
  const resyncMutation = useResyncMailAccount();
  const controlsDisabled = updateMutation.isPending || removeMutation.isPending;

  function handleUpdate(input: { enabled?: boolean; syncFrequencySeconds?: number; backfillDays?: number }) {
    void updateMutation.mutateAsync({ id: account.id, ...input }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to update mail account'), { id: `mail-update-${account.id}` });
    });
  }

  function handleResync(mode: 'full' | 'incremental') {
    void resyncMutation.mutateAsync({ id: account.id, mode }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to start resync'), { id: `mail-resync-${account.id}` });
    });
  }

  function handleRemove() {
    void removeMutation
      .mutateAsync(account.id)
      .then(() => setRemoveOpen(false))
      .catch((error: unknown) => {
        toast.error(getErrorMessage(error, 'Failed to remove mail account'), { id: `mail-remove-${account.id}` });
      });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate">{account.email}</span>
          <SyncPhaseBadge phase={status.syncPhase} />
        </CardTitle>
        <CardDescription>Last synced: {formatLastSyncedAt(status.lastSyncedAt)}</CardDescription>
        <CardAction>
          <Switch
            checked={account.enabled}
            disabled={controlsDisabled}
            aria-label={`Enable sync for ${account.email}`}
            onCheckedChange={(enabled) => handleUpdate({ enabled })}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.lastError ? <AccountErrorBanner account={account} error={status.lastError} /> : null}
        <SyncProgress status={status} />
        <SettingRows>
          <SettingRow
            label="Sync frequency"
            description="Seconds between incremental sync checks."
            htmlFor={`${account.id}-sync-frequency`}>
            <SettingRowControl size="sm">
              <MailNumberInput
                id={`${account.id}-sync-frequency`}
                value={account.syncFrequencySeconds}
                min={30}
                disabled={controlsDisabled}
                onSave={(syncFrequencySeconds) => handleUpdate({ syncFrequencySeconds })}
              />
            </SettingRowControl>
          </SettingRow>
          <SettingRow
            label="Backfill window"
            description="Days of message bodies to keep hydrated."
            htmlFor={`${account.id}-backfill-days`}>
            <SettingRowControl size="sm">
              <MailNumberInput
                id={`${account.id}-backfill-days`}
                value={account.backfillDays}
                min={1}
                disabled={controlsDisabled}
                onSave={(backfillDays) => handleUpdate({ backfillDays })}
              />
            </SettingRowControl>
          </SettingRow>
        </SettingRows>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={resyncMutation.isPending}
            onClick={() => handleResync('incremental')}>
            <RefreshCwIcon />
            Incremental resync
          </Button>
          <Button variant="outline" size="sm" disabled={resyncMutation.isPending} onClick={() => handleResync('full')}>
            <RefreshCwIcon />
            Full resync
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={removeMutation.isPending}
            onClick={() => setRemoveOpen(true)}>
            <TrashIcon />
            Remove
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        icon={<TrashIcon />}
        title="Remove mail account?"
        description={`This removes ${account.email} from local mail sync and deletes local mail data only. It does not disconnect Google or delete mail from Gmail.`}
        onConfirm={handleRemove}
        confirmLabel="Remove account"
        pendingLabel="Removing..."
        isPending={removeMutation.isPending}
      />
    </Card>
  );
}

function EnrolledAccountsSection({
  accounts,
  statuses,
}: {
  accounts: MailAccountView[];
  statuses: MailSyncStatusView[] | undefined;
}) {
  if (accounts.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailIcon />
          </EmptyMedia>
          <EmptyTitle>No mail accounts enrolled</EmptyTitle>
          <EmptyDescription>Enroll a connected Google account below to start syncing mail locally.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {accounts.map((account) => (
        <MailAccountCard key={account.id} account={account} status={getStatusForAccount(account, statuses)} />
      ))}
    </div>
  );
}

function EligibleAccountsSection() {
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
    <div className="space-y-2">
      {eligibleAccounts.map((account) => (
        <div
          key={account.connectorInstanceId}
          className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{account.email}</p>
            <p className="text-xs text-muted-foreground">Connected Google account</p>
          </div>
          <Button
            size="sm"
            disabled={enrollMutation.isPending}
            onClick={() => handleEnroll(account.connectorInstanceId)}>
            Enroll
          </Button>
        </div>
      ))}
    </div>
  );
}

export function MailSettings() {
  const page = SETTINGS_PAGE_BY_ID.mail;
  const { data: accounts, isLoading, error } = useQuery(mailAccountsQueryOptions);
  const { data: statuses } = useQuery(mailSyncStatusQueryOptions);

  return (
    <SettingPage title={page.title} description={page.description} icon={<page.icon />}>
      <SettingSection>
        <AppEnableSetting appId="mail" label="Mail" />
      </SettingSection>

      <SettingSection title="Enrolled accounts" description="Manage local Gmail sync settings per account.">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading mail accounts...</p> : null}
        {error ? (
          <p className="text-sm text-destructive">{getErrorMessage(error, 'Failed to load mail accounts')}</p>
        ) : null}
        {accounts ? <EnrolledAccountsSection accounts={accounts} statuses={statuses} /> : null}
      </SettingSection>

      <SettingSection
        title="Add account"
        description="Eligible connected Google accounts that are not already enrolled.">
        <EligibleAccountsSection />
      </SettingSection>
    </SettingPage>
  );
}
