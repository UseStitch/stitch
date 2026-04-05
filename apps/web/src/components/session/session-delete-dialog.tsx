import { useNavigate } from '@tanstack/react-router';

import type { PrefixedString } from '@stitch/shared/id';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete session?</DialogTitle>
          <DialogDescription>
            This permanently removes the session and all of its messages. This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              void handleDeleteSession();
            }}
            disabled={deleteSession.isPending}
          >
            {deleteSession.isPending ? 'Deleting...' : 'Delete session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
