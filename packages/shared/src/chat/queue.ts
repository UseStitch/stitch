import type { PrefixedString } from '../id/index.js';

export type QueuedMessageAttachment = {
  path: string;
  mime: string;
  filename: string;
};

export type QueuedMessage = {
  id: PrefixedString<'qmsg'>;
  sessionId: PrefixedString<'ses'>;
  content: string;
  attachments: QueuedMessageAttachment[];
  position: number;
  createdAt: number;
  updatedAt: number;
};
