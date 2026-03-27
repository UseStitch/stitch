import type { QueuedMessageAttachment } from '@stitch/shared/chat/queue';

export type RightPanel = 'closed' | 'details' | 'queue';

export type EditQueuedMessagePayload = {
  content: string;
  attachments: QueuedMessageAttachment[];
};

export type SendQueuedMessageFn = (content: string, attachments: QueuedMessageAttachment[]) => void;
