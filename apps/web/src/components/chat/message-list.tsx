import type { Message } from '@openwork/shared'
import { MessageBubble, StreamingMessageBubble } from '@/components/chat/message-bubble'
import type { ChatStreamState } from '@/hooks/use-chat-stream'

export type MessageListProps = {
  messages: Message[]
  streamState: ChatStreamState
}

export function MessageList({ messages, streamState }: MessageListProps) {
  const hasStreamContent =
    streamState.isStreaming ||
    streamState.partIds.length > 0 ||
    streamState.error !== null

  return (
    <div className="flex flex-col gap-4 py-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} role={msg.role} parts={msg.parts} />
      ))}

      {hasStreamContent && (
        streamState.error ? (
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
        )
      )}
    </div>
  )
}
