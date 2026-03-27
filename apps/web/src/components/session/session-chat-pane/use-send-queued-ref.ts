import * as React from 'react';

import type { SendQueuedMessageFn } from '@/components/session/session-page-types';

type UseSendQueuedRefOptions = {
  sendQueuedRef: React.RefObject<SendQueuedMessageFn | null>;
  canSendQueuedMessage: () => boolean;
  onSendQueuedMessage: SendQueuedMessageFn;
};

export function useSendQueuedRef(options: UseSendQueuedRefOptions) {
  const { sendQueuedRef, canSendQueuedMessage, onSendQueuedMessage } = options;

  React.useEffect(() => {
    sendQueuedRef.current = (content, queueAttachments) => {
      if (!canSendQueuedMessage()) return;
      onSendQueuedMessage(content, queueAttachments);
    };

    return () => {
      sendQueuedRef.current = null;
    };
  }, [sendQueuedRef, canSendQueuedMessage, onSendQueuedMessage]);
}
