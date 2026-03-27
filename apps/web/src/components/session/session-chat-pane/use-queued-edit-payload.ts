import * as React from 'react';

import type { Attachment } from '@/components/chat/chat-input-parts/types';
import type { EditQueuedMessagePayload } from '@/components/session/session-page-types';

type UseQueuedEditPayloadOptions = {
  editPayload: EditQueuedMessagePayload | null;
  onConsumeEditPayload: () => void;
  setValue: (value: string) => void;
};

function toPendingAttachments(payload: EditQueuedMessagePayload): Attachment[] {
  return payload.attachments.map((attachment, index) => ({
    id: `edit_${Date.now()}_${String(index)}`,
    path: attachment.path,
    previewUrl: null,
    mime: attachment.mime,
    filename: attachment.filename,
  }));
}

export function useQueuedEditPayload(options: UseQueuedEditPayloadOptions) {
  const { editPayload, onConsumeEditPayload, setValue } = options;
  const [pendingAttachments, setPendingAttachments] = React.useState<Attachment[] | undefined>(
    undefined,
  );

  React.useEffect(() => {
    if (!editPayload) return;

    setValue(editPayload.content);

    if (editPayload.attachments.length > 0) {
      setPendingAttachments(toPendingAttachments(editPayload));
    }

    onConsumeEditPayload();
  }, [editPayload, onConsumeEditPayload, setValue]);

  const handlePendingAttachmentsConsumed = React.useCallback(() => {
    setPendingAttachments(undefined);
  }, []);

  return {
    pendingAttachments,
    handlePendingAttachmentsConsumed,
  };
}
