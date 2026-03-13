import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { ChatInput } from '@/components/chat/chat-input'
import { MessageList } from '@/components/chat/message-list'
import { enabledProviderModelsQueryOptions } from '@/lib/queries/providers'
import { sessionQueryOptions, useSendMessage } from '@/lib/queries/chat'
import { useChatStreamContext } from '@/context/chat-stream-context'

export const Route = createFileRoute('/session/$id')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(sessionQueryOptions(params.id)),
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
    ]),
  component: SessionComponent,
})

const SEPARATOR = ':::'

function SessionComponent() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const { data: session } = useSuspenseQuery(sessionQueryOptions(id))

  const [value, setValue] = React.useState('')
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null)

  const sendMessage = useSendMessage()
  const { activeMessageId, setActiveMessageId, ...streamState } = useChatStreamContext()

  const bottomRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new content arrives
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.messages.length, streamState.partIds.length])

  // When stream finishes, refresh message list and clear active stream
  React.useEffect(() => {
    if (!streamState.isStreaming && activeMessageId !== null && streamState.finishReason !== null) {
      void queryClient.invalidateQueries({ queryKey: ['sessions', 'detail', id] })
      setActiveMessageId(null)
    }
  }, [streamState.isStreaming, streamState.finishReason, activeMessageId, id, queryClient, setActiveMessageId])

  async function handleSubmit(text: string) {
    if (!text.trim() || !selectedModel) {
      return
    }

    const [providerId, modelId] = selectedModel.split(SEPARATOR)
    if (!providerId || !modelId) {
      return
    }

    setValue('')

    const assistantMessageId = crypto.randomUUID()
    setActiveMessageId(assistantMessageId)

    await sendMessage.mutateAsync({
      sessionId: id,
      content: text,
      providerId,
      modelId,
      assistantMessageId,
    })
  }

  const canSubmit = !sendMessage.isPending && !streamState.isStreaming

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4">
        <div className="mx-auto max-w-2xl">
          <MessageList
            messages={session.messages}
            streamState={streamState}
            bottomRef={bottomRef}
          />
        </div>
      </div>

      <div className="border-t border-border/40 bg-background px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <ChatInput
            value={value}
            onChange={setValue}
            onSubmit={(text) => { void handleSubmit(text) }}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            placeholder={canSubmit ? 'Ask a follow-up...' : 'Waiting for response...'}
          />
        </div>
      </div>
    </div>
  )
}
