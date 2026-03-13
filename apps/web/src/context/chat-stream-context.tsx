import * as React from 'react'
import { useChatStream, type UseChatStreamResult } from '@/hooks/use-chat-stream'

const ChatStreamContext = React.createContext<UseChatStreamResult | null>(null)

export function ChatStreamProvider({ children }: { children: React.ReactNode }) {
  const stream = useChatStream()
  return <ChatStreamContext.Provider value={stream}>{children}</ChatStreamContext.Provider>
}

export function useChatStreamContext(): UseChatStreamResult {
  const ctx = React.useContext(ChatStreamContext)
  if (!ctx) throw new Error('useChatStreamContext must be used within ChatStreamProvider')
  return ctx
}
