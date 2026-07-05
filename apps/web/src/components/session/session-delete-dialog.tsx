import { useNavigate } from '@tanstack/react-router';

import type { PrefixedString } from '@stitch/shared/id';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDeleteSession } from '@/lib/queries/chat';

type SessionDeleteDialogProps = {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
};

export function SessionDeleteDialog({ sessionId, open, onOpenChange, onDeleted }: SessionDeleteDialogProps) {
  const navigate = useNavigate();
  const deleteSession = useDeleteSession();

  async function handleDeleteSession() {
    await deleteSession.mutateAsync({ sessionId: sessionId as PrefixedString<'ses'> });
    onOpenChange(false);
    onDeleted?.();
    void navigate({ to: '/' });
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete session?"
      description="This permanently removes the session and all of its messages. This action cannot be undone."
      onConfirm={() => void handleDeleteSession()}
      confirmLabel="Delete session"
      isPending={deleteSession.isPending}
      contentClassName="max-w-sm"
    />
  );
}
