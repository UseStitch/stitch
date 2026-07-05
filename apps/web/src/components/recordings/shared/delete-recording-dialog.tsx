import type { Recording } from '@stitch/shared/recordings/types';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface DeleteRecordingDialogProps {
  recording: Recording | null | undefined;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteRecordingDialog({ recording, isDeleting, onOpenChange, onConfirm }: DeleteRecordingDialogProps) {
  return (
    <ConfirmDialog
      open={Boolean(recording)}
      onOpenChange={onOpenChange}
      title="Delete recording?"
      description={`This permanently deletes "${recording?.title}" and its local audio file.`}
      onConfirm={onConfirm}
      isPending={isDeleting}
    />
  );
}
