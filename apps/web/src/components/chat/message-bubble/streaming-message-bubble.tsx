import * as React from 'react';
import { useDeferredValue } from 'react';

import { AssistantBubbleWrapper, FileBlock } from './shared-components';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { ReasoningBlock } from '@/components/chat/message-bubble/reasoning-block.js';
import { SourceChip } from '@/components/chat/message-bubble/source-chip.js';
import { ToolCallGroup } from '@/components/chat/message-bubble/tool-call-group.js';
import type { StreamingPart } from '@/stores/stream-store';

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

  const nodes: React.ReactNode[] = [];
  let toolGroup: { key: string; partIds: string[] } | null = null;

  function flushToolGroup() {
    if (!toolGroup) return;
    const group = toolGroup;
    toolGroup = null;

    nodes.push(
      <ToolCallGroup
        key={group.key}
        calls={group.partIds.flatMap((partId) => {
          const part = parts[partId];
          if (!part || part.type !== 'tool-call' || part.toolName === 'todo') return [];
          return [
            {
              id: part.toolCallId,
              toolName: part.toolName,
              status: part.status,
              args: part.input,
              result: part.output,
              error: part.error ?? undefined,
            },
          ];
        })}
        onAbort={onAbortTool}
      />,
    );
  }

  for (const partId of visibleIds) {
    const part = parts[partId];
    if (!part) continue;

    if (part.type === 'tool-call') {
      if (toolGroup) {
        toolGroup.partIds.push(partId);
      } else {
        toolGroup = { key: `tools-${partId}`, partIds: [partId] };
      }
      continue;
    }

    flushToolGroup();

    switch (part.type) {
      case 'text':
        nodes.push(
          <div key={partId}>
            <StreamingTextPart text={part.text} />
          </div>,
        );
        break;
      case 'reasoning':
        nodes.push(
          <ReasoningBlock
            key={partId}
            text={part.text}
            isStreaming={part.status === 'streaming'}
          />,
        );
        break;
      case 'source': {
        const source = part.source;
        if (source.sourceType === 'url') {
          nodes.push(<SourceChip key={partId} url={source.url} title={source.title} />);
        }
        break;
      }
      case 'file':
        nodes.push(<FileBlock key={partId} mediaType={part.mediaType} />);
        break;
    }
  }

  flushToolGroup();

  return <AssistantBubbleWrapper>{nodes}</AssistantBubbleWrapper>;
});
