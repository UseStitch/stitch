import { useNavigate } from '@tanstack/react-router';

import { isIdOfType } from '@stitch/shared/id';

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
    if (!isIdOfType(sessionId, 'ses')) return;

    await deleteSession.mutateAsync({ sessionId });
    onOpenChange(false);
    onDeleted?.();
    void navigate({ to: '/' });
  }

  async function handleArchiveSession() {
    if (!isIdOfType(sessionId, 'ses')) return;

    await archiveSession.mutateAsync({ sessionId });
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
