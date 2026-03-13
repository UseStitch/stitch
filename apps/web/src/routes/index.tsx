import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ChatInput } from '@/components/chat-input'
import { enabledProviderModelsQueryOptions } from '@/lib/queries/providers'

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
  component: IndexComponent,
})

function IndexComponent() {
  const [value, setValue] = React.useState('')
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null)

  function handleSubmit(_text: string) {
    setValue('')
  }

  return (
    <div className="flex h-full flex-col items-center justify-end p-4">
      <div className="w-full max-w-2xl">
        <ChatInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
      </div>
    </div>
  )
}
