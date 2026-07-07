import { useNavigate } from '@tanstack/react-router';

import type { PrefixedString } from '@stitch/shared/id';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useArchiveSession, useDeleteSession } from '@/lib/queries/chat';

type SessionDeleteDialogProps = {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
};

export function SessionDeleteDialog({ sessionId, open, onOpenChange, onDeleted }: SessionDeleteDialogProps) {
  const navigate = useNavigate();
  const deleteSession = useDeleteSession();
  const archiveSession = useArchiveSession();

  async function handleDeleteSession() {
    await deleteSession.mutateAsync({ sessionId: sessionId as PrefixedString<'ses'> });
    onOpenChange(false);
    onDeleted?.();
    void navigate({ to: '/' });
  }

  async function handleArchiveSession() {
    await archiveSession.mutateAsync({ sessionId: sessionId as PrefixedString<'ses'> });
    onOpenChange(false);
    onDeleted?.();
    void navigate({ to: '/' });
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete session?"
      description="This permanently deletes the session, messages, and usage data. You can archive it instead."
      onConfirm={() => void handleDeleteSession()}
      onSecondaryAction={() => void handleArchiveSession()}
      confirmLabel="Delete session"
      secondaryActionLabel="Archive instead"
      isPending={deleteSession.isPending}
      isSecondaryPending={archiveSession.isPending}
      contentClassName="max-w-sm"
    />
  );
}
