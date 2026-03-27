import * as React from 'react';

import type { StoredPart } from '@stitch/shared/chat/messages';

import { AssistantMessageBubble } from '@/components/chat/message-bubble/assistant-message-bubble';
import { StreamingMessageBubble } from '@/components/chat/message-bubble/streaming-message-bubble';
import { UserMessageBubble } from '@/components/chat/message-bubble/user-message-bubble';

export { CompactionDivider } from '@/components/chat/message-bubble/compaction-divider.js';
export { StreamingMessageBubble } from '@/components/chat/message-bubble/streaming-message-bubble';

type MessageBubbleProps = {
  role: 'user' | 'assistant';
  parts: StoredPart[];
  finishReason?: string | null;
  onAbortTool?: () => void;
  onSplit?: () => void;
};

export const MessageBubble = React.memo(function MessageBubble({
  role,
  parts,
  finishReason,
  onAbortTool,
  onSplit,
}: MessageBubbleProps) {
  if (role === 'user') {
    return <UserMessageBubble parts={parts} onSplit={onSplit} />;
  }

  return <AssistantMessageBubble parts={parts} finishReason={finishReason} onAbortTool={onAbortTool} />;
});
