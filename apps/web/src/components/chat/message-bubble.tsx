import type { StoredPart } from '@stitch/shared/chat/messages';

import { AssistantMessageBubble } from '@/components/chat/message-bubble/assistant-message-bubble';
import { BackgroundTaskResultBubble } from '@/components/chat/message-bubble/background-task-result-bubble';
import { UserMessageBubble } from '@/components/chat/message-bubble/user-message-bubble';

type MessageBubbleProps = {
  role: 'user' | 'assistant';
  parts: StoredPart[];
  finishReason?: string | null;
  onAbortTool?: () => void;
  onSplit?: () => void;
  onEdit?: () => void;
};

export function MessageBubble({ role, parts, finishReason, onAbortTool, onSplit, onEdit }: MessageBubbleProps) {
  const backgroundTaskResults = parts.filter(
    (part): part is Extract<StoredPart, { type: 'background-task-result' }> => part.type === 'background-task-result',
  );
  if (role === 'user' && backgroundTaskResults.length === parts.length && backgroundTaskResults.length > 0) {
    return <BackgroundTaskResultBubble parts={backgroundTaskResults} />;
  }

  if (role === 'user') {
    return <UserMessageBubble parts={parts} onSplit={onSplit} onEdit={onEdit} />;
  }

  return <AssistantMessageBubble parts={parts} finishReason={finishReason} onAbortTool={onAbortTool} />;
}
