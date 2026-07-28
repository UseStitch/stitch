import { AlertCircleIcon, RefreshCwIcon, TrashIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import type { MailAccountView, MailSyncPhase } from '@stitch/shared/mail/types';

import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useRemoveMailAccount, useResyncMailAccount, useUpdateMailAccount } from '@/lib/mutations/mail';
import type { MailSyncStatusView } from '@/lib/queries/mail';
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
  backfill: 'border-warning-subtle bg-warning-subtle text-warning',
  incremental: 'border-success bg-success-subtle text-success',
  reconciling: 'border-warning-subtle bg-warning-subtle text-warning',
  error: 'border-destructive-subtle bg-destructive-subtle text-destructive',
};

function formatLastSyncedAt(value: number | null): string {
  if (value === null) return 'Never';
  return formatDateTime(value);
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
  const [syncedValue, setSyncedValue] = React.useState(value);

  if (syncedValue !== value) {
    setSyncedValue(value);
    setLocalValue(String(value));
  }

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
      className="h-7 w-20 px-space-m text-xs"
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
    <div className="space-y-space-s">
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
    <div className="rounded-lg border border-destructive-subtle bg-destructive-subtle p-space-l text-sm text-destructive">
      <Stack direction="row" align="start" justify="between" gap="l">
        <div className="min-w-0">
          <Stack direction="row" gap="m">
            <span className="mt-space-2xs">
              <Icon as={AlertCircleIcon} size="m" />
            </span>
            <div className="min-w-0">
              <Text variant="body-strong" tone="destructive">
                Sync error
              </Text>
              <div className="mt-space-xs wrap-break-word">
                <Text variant="caption" tone="destructive">
                  {error}
                </Text>
              </div>
            </div>
          </Stack>
        </div>
        <Button variant="destructive" size="sm" disabled={resyncMutation.isPending} onClick={handleRetry}>
          {resyncMutation.isPending ? 'Retrying...' : 'Retry'}
        </Button>
      </Stack>
    </div>
  );
}

export function MailAccountCard({ account, status }: { account: MailAccountView; status: MailSyncStatusView }) {
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
    <div className="rounded-lg border border-border-subtle bg-card px-space-l py-space-m">
      <Stack direction="row" align="start" justify="between" gap="l">
        <div className="min-w-0 space-y-space-xs">
          <div className="flex min-w-0 items-center gap-space-m">
            <Text as="span" variant="body-strong" truncate>
              {account.email}
            </Text>
            <SyncPhaseBadge phase={status.syncPhase} />
          </div>
          <Text variant="caption" tone="muted">
            Last synced: {formatLastSyncedAt(status.lastSyncedAt)}
          </Text>
        </div>
        <div className="shrink-0">
          <Switch
            checked={account.enabled}
            disabled={controlsDisabled}
            aria-label={`Enable sync for ${account.email}`}
            onCheckedChange={(enabled) => handleUpdate({ enabled })}
          />
        </div>
      </Stack>
      {status.lastError ? (
        <div className="mt-space-l">
          <AccountErrorBanner account={account} error={status.lastError} />
        </div>
      ) : null}
      <div className="mt-space-m">
        <SyncProgress status={status} />
      </div>
      <div className="mt-space-m flex flex-wrap items-center justify-between gap-space-m border-t border-border-subtle pt-space-m">
        <div className="flex flex-wrap gap-space-l text-xs text-muted-foreground">
          <label className="flex items-center gap-space-s" htmlFor={`${account.id}-sync-frequency`}>
            <span>Every</span>
            <MailNumberInput
              id={`${account.id}-sync-frequency`}
              value={account.syncFrequencySeconds}
              min={30}
              disabled={controlsDisabled}
              onSave={(syncFrequencySeconds) => handleUpdate({ syncFrequencySeconds })}
            />
            <span>sec</span>
          </label>
          <label className="flex items-center gap-space-s" htmlFor={`${account.id}-backfill-days`}>
            <span>Backfill</span>
            <MailNumberInput
              id={`${account.id}-backfill-days`}
              value={account.backfillDays}
              min={1}
              disabled={controlsDisabled}
              onSave={(backfillDays) => handleUpdate({ backfillDays })}
            />
            <span>days</span>
          </label>
        </div>
        <Stack direction="row" gap="s">
          <Button
            variant="outline"
            size="sm"
            className="px-space-m text-xs"
            disabled={resyncMutation.isPending}
            onClick={() => handleResync('incremental')}>
            <Icon as={RefreshCwIcon} size="s" />
            Sync
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="px-space-m text-xs"
            disabled={resyncMutation.isPending}
            onClick={() => handleResync('full')}>
            <Icon as={RefreshCwIcon} size="s" />
            Full
          </Button>
          <Button
            variant="destructive"
            size="icon-sm"
            disabled={removeMutation.isPending}
            aria-label={`Remove ${account.email}`}
            onClick={() => setRemoveOpen(true)}>
            <Icon as={TrashIcon} size="s" />
          </Button>
        </Stack>
      </div>
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
    </div>
  );
}
