import type { Recording } from '@stitch/shared/recordings/types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeleteRecordingDialogProps {
  recording: Recording | null | undefined;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteRecordingDialog({
  recording,
  isDeleting,
  onOpenChange,
  onConfirm,
}: DeleteRecordingDialogProps) {
  return (
    <Dialog open={Boolean(recording)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete recording?</DialogTitle>
          <DialogDescription>
            This permanently deletes &quot;{recording?.title}&quot; and its local audio file.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
