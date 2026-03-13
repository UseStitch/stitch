import * as React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ChatInput } from '@/components/chat/chat-input'
import { enabledProviderModelsQueryOptions } from '@/lib/queries/providers'
import { useCreateSession, useSendMessage, sessionKeys } from '@/lib/queries/chat'
import type { SessionWithMessages } from '@/lib/queries/chat'
import { useChatStreamContext } from '@/context/chat-stream-context'

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
  component: IndexComponent,
})

const SEPARATOR = ':::'

function IndexComponent() {
  const [value, setValue] = React.useState('')
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const createSession = useCreateSession()
  const sendMessage = useSendMessage()
  const { setActiveMessageId } = useChatStreamContext()

  async function handleSubmit(text: string) {
    if (!text.trim() || !selectedModel) return

    const [providerId, modelId] = selectedModel.split(SEPARATOR)
    if (!providerId || !modelId) return

    setValue('')

    const assistantMessageId = crypto.randomUUID()
    const session = await createSession.mutateAsync({})

    queryClient.setQueryData<SessionWithMessages>(sessionKeys.detail(session.id), {
      ...session,
      messages: [],
    })

    setActiveMessageId(assistantMessageId)
    void sendMessage.mutateAsync({
      sessionId: session.id,
      content: text,
      providerId,
      modelId,
      assistantMessageId,
    })

    void navigate({ to: '/session/$id', params: { id: session.id } })
  }

  const isSubmitting = createSession.isPending || sendMessage.isPending

  return (
    <div className="flex h-full flex-col items-center justify-center p-4 gap-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">What can I help you with?</h1>
        <p className="text-sm text-muted-foreground">
          Select a model and start a conversation
        </p>
      </div>
      <div className="w-full max-w-2xl">
        <ChatInput
          value={value}
          onChange={setValue}
          onSubmit={(text) => { void handleSubmit(text) }}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          placeholder={isSubmitting ? 'Starting session...' : 'Ask anything...'}
        />
      </div>
    </div>
  )
}
