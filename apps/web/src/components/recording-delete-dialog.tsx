import { useNavigate } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDeleteMeeting } from '@/lib/queries/meetings';

type RecordingDeleteDialogProps = {
  meetingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RecordingDeleteDialog({
  meetingId,
  open,
  onOpenChange,
}: RecordingDeleteDialogProps) {
  const navigate = useNavigate();
  const deleteMeeting = useDeleteMeeting();

  async function handleDelete() {
    await deleteMeeting.mutateAsync(meetingId);
    onOpenChange(false);
    void navigate({ to: '/recordings' });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete recording?</DialogTitle>
          <DialogDescription>
            This permanently removes the recording, its audio file, and any transcriptions. This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              void handleDelete();
            }}
            disabled={deleteMeeting.isPending}
          >
            {deleteMeeting.isPending ? 'Deleting...' : 'Delete recording'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
