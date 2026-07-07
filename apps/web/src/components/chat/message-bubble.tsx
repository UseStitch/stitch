import * as React from 'react';

import type { StoredPart } from '@stitch/shared/chat/messages';

import { AssistantMessageBubble } from '@/components/chat/message-bubble/assistant-message-bubble';
import { UserMessageBubble } from '@/components/chat/message-bubble/user-message-bubble';

type MessageBubbleProps = {
  role: 'user' | 'assistant';
  parts: StoredPart[];
  finishReason?: string | null;
  onAbortTool?: () => void;
  onSplit?: () => void;
  onEdit?: () => void;
};

export const MessageBubble = React.memo(function MessageBubble({
  role,
  parts,
  finishReason,
  onAbortTool,
  onSplit,
  onEdit,
}: MessageBubbleProps) {
  if (role === 'user') {
    return <UserMessageBubble parts={parts} onSplit={onSplit} onEdit={onEdit} />;
  }

  return <AssistantMessageBubble parts={parts} finishReason={finishReason} onAbortTool={onAbortTool} />;
});
