import { useMemo } from 'react';
import type { Message } from '@openwork/shared';
import {
  MessageBubble,
  StreamingMessageBubble,
  CompactionDivider,
} from '@/components/chat/message-bubble';
import type { ChatStreamState } from '@/hooks/use-chat-stream';

type MessageListProps = {
  messages: Message[];
  streamState: ChatStreamState;
};

/**
 * Build a map from compaction-marker message ID → the following summary message
 * (if any). Returns both the map and a set of summary IDs that should be
 * skipped in the main render loop (they're rendered inside the divider).
 */
function buildCompactionPairs(messages: Message[]) {
  const summaryByMarker = new Map<string, Message>();
  const pairedSummaryIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user' && msg.parts.some((p) => p.type === 'compaction')) {
      const next = messages[i + 1];
      if (next?.isSummary) {
        summaryByMarker.set(msg.id, next);
        pairedSummaryIds.add(next.id);
      }
    }
  }

  return { summaryByMarker, pairedSummaryIds };
}

export function MessageList({ messages, streamState }: MessageListProps) {
  const hasStreamContent =
    streamState.isStreaming || streamState.partIds.length > 0 || streamState.error !== null;

  const { summaryByMarker, pairedSummaryIds } = useMemo(
    () => buildCompactionPairs(messages),
    [messages],
  );

  return (
    <div className="flex flex-col gap-6 py-4">
      {messages.map((msg) => {
        // Compaction marker — render divider with optional collapsible summary
        if (msg.role === 'user' && msg.parts.some((p) => p.type === 'compaction')) {
          const summary = summaryByMarker.get(msg.id);
          return <CompactionDivider key={msg.id} summaryParts={summary?.parts} />;
        }

        // Summary messages paired with a marker are rendered inside the divider
        if (pairedSummaryIds.has(msg.id)) {
          return null;
        }

        return <MessageBubble key={msg.id} role={msg.role} parts={msg.parts} />;
      })}

      {hasStreamContent &&
        (streamState.error ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {streamState.error}
            </div>
          </div>
        ) : (
          <StreamingMessageBubble
            partIds={streamState.partIds}
            parts={streamState.parts}
            isStreaming={streamState.isStreaming}
          />
        ))}
    </div>
  );
}
