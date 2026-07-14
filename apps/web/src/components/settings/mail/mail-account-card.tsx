import { AlertCircleIcon, RefreshCwIcon, TrashIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import type { MailAccountView, MailSyncPhase } from '@stitch/shared/mail/types';

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
  backfill: 'border-warning/30 bg-warning/10 text-warning',
  incremental: 'border-success/30 bg-success/10 text-success',
  reconciling: 'border-warning/30 bg-warning/10 text-warning',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
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
      className="h-7 w-20 px-2 text-xs"
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
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{account.email}</span>
            <SyncPhaseBadge phase={status.syncPhase} />
          </div>
          <p className="text-xs text-muted-foreground">Last synced: {formatLastSyncedAt(status.lastSyncedAt)}</p>
        </div>
        <div className="shrink-0">
          <Switch
            checked={account.enabled}
            disabled={controlsDisabled}
            aria-label={`Enable sync for ${account.email}`}
            onCheckedChange={(enabled) => handleUpdate({ enabled })}
          />
        </div>
      </div>
      {status.lastError ? (
        <div className="mt-3">
          <AccountErrorBanner account={account} error={status.lastError} />
        </div>
      ) : null}
      <div className="mt-2">
        <SyncProgress status={status} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2">
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-1.5" htmlFor={`${account.id}-sync-frequency`}>
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
          <label className="flex items-center gap-1.5" htmlFor={`${account.id}-backfill-days`}>
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
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={resyncMutation.isPending}
            onClick={() => handleResync('incremental')}>
            <RefreshCwIcon className="size-3.5" />
            Sync
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={resyncMutation.isPending}
            onClick={() => handleResync('full')}>
            <RefreshCwIcon className="size-3.5" />
            Full
          </Button>
          <Button
            variant="destructive"
            size="icon-sm"
            disabled={removeMutation.isPending}
            aria-label={`Remove ${account.email}`}
            onClick={() => setRemoveOpen(true)}>
            <TrashIcon className="size-3.5" />
          </Button>
        </div>
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
