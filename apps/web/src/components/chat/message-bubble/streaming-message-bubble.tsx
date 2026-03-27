import * as React from 'react';
import { useDeferredValue } from 'react';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { ReasoningBlock } from '@/components/chat/message-bubble/reasoning-block.js';
import { SourceChip } from '@/components/chat/message-bubble/source-chip.js';
import { ToolCallBlock } from '@/components/chat/message-bubble/tool-call-block.js';
import type { StreamingPart } from '@/stores/stream-store';

import { AssistantBubbleWrapper, FileBlock } from './shared-components';

function StreamingTextPart({ text }: { text: string }) {
  const deferredText = useDeferredValue(text);
  return <ChatMarkdown text={deferredText} isStreaming />;
}

type StreamingMessageBubbleProps = {
  partIds: string[];
  parts: Record<string, StreamingPart>;
  onAbortTool?: () => void;
};

export const StreamingMessageBubble = React.memo(function StreamingMessageBubble({
  partIds,
  parts,
  onAbortTool,
}: StreamingMessageBubbleProps) {
  const visibleIds = partIds.filter((id) => id in parts);

  const hasAnyContent = visibleIds.some((partId) => {
    const part = parts[partId];
    if (!part) return false;
    if (part.type === 'text' || part.type === 'reasoning') {
      return part.hasContent;
    }
    return true;
  });

  if (!hasAnyContent) {
    return null;
  }

  return (
    <AssistantBubbleWrapper>
      {visibleIds.map((partId) => {
        const part = parts[partId];
        if (!part) return null;

        switch (part.type) {
          case 'text':
            return (
              <div key={partId}>
                <StreamingTextPart text={part.text} />
              </div>
            );
          case 'reasoning':
            return <ReasoningBlock key={partId} text={part.text} isStreaming={part.status === 'streaming'} />;
          case 'tool-call':
            return (
              <ToolCallBlock
                key={partId}
                toolName={part.toolName}
                status={part.status}
                args={part.input}
                result={part.output}
                error={part.error ?? undefined}
                onAbort={onAbortTool}
              />
            );
          case 'source': {
            const source = part.source;
            if (source.sourceType === 'url') {
              return <SourceChip key={partId} url={source.url} title={source.title} />;
            }
            return null;
          }
          case 'file':
            return <FileBlock key={partId} mediaType={part.mediaType} />;
        }
      })}
    </AssistantBubbleWrapper>
  );
});
