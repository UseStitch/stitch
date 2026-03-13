import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { ChatInput } from '@/components/chat/chat-input'
import { MessageList } from '@/components/chat/message-list'
import { enabledProviderModelsQueryOptions } from '@/lib/queries/providers'
import { sessionQueryOptions, useSendMessage } from '@/lib/queries/chat'
import { useChatStreamContext } from '@/context/chat-stream-context'
import { settingsQueryOptions, saveSettingMutationOptions } from '@/lib/queries/settings'

export const Route = createFileRoute('/session/$id')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(sessionQueryOptions(params.id)),
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(settingsQueryOptions),
    ]),
  component: SessionComponent,
})

const SEPARATOR = ':::'

function SessionComponent() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const { data: session } = useSuspenseQuery(sessionQueryOptions(id))
  const { data: settings } = useSuspenseQuery(settingsQueryOptions)

  const [value, setValue] = React.useState('')
  const [modelOverride, setModelOverride] = React.useState<string | null>(null)
  const selectedModel = modelOverride ?? settings['model.default'] ?? null

  const saveDefaultModel = useMutation(saveSettingMutationOptions('model.default', queryClient, { silent: true }))

  function handleModelChange(model: string | null) {
    setModelOverride(model)
    if (model) saveDefaultModel.mutate(model)
  }

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
    <div className="flex h-full flex-col relative">
      <div className="flex-1 overflow-y-auto px-6 pb-32">
        <MessageList
          messages={session.messages}
          streamState={streamState}
          bottomRef={bottomRef}
        />
      </div>

      <div className="absolute bottom-0 inset-x-0 px-6 pb-4 pt-8 bg-linear-to-t from-muted via-muted/90 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 inset-x-0 px-6 pb-4 pointer-events-auto">
        <div className="mx-auto max-w-4xl">
          <ChatInput
            value={value}
            onChange={setValue}
            onSubmit={(text) => { void handleSubmit(text) }}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
            placeholder={canSubmit ? 'Ask a follow-up...' : 'Waiting for response...'}
          />
        </div>
      </div>
    </div>
  )
}
