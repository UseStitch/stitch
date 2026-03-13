import * as React from 'react'
import type { LanguageModelUsage, LanguageModelV3Source } from '@openwork/shared'
import type {
  PartDelta,
  PartUpdate,
  StreamErrorPayload,
  StreamFinishPayload,
  StreamPartDeltaPayload,
  StreamPartUpdatePayload,
  StreamStartPayload,
} from '@openwork/shared'
import { useSSE } from '@/hooks/use-sse'

// ─── Streaming part types (FE in-flight state) ────────────────────────────────

export type StreamingTextPart = {
  type: 'text'
  id: string
  text: string
  status: 'streaming' | 'complete'
  startedAt: number
  endedAt: number | null
}

export type StreamingReasoningPart = {
  type: 'reasoning'
  id: string
  text: string
  status: 'streaming' | 'complete'
  startedAt: number
  endedAt: number | null
}

export type StreamingToolCallPart = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  input: unknown
  startedAt: number
  endedAt: number
}

export type StreamingToolResultPart = {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  output: unknown
  startedAt: number
  endedAt: number
}

export type StreamingSourcePart = {
  type: 'source'
  source: LanguageModelV3Source
  startedAt: number
  endedAt: number
}

export type StreamingFilePart = {
  type: 'file'
  data: string
  mediaType: string
  startedAt: number
  endedAt: number
}

export type StreamingPart =
  | StreamingTextPart
  | StreamingReasoningPart
  | StreamingToolCallPart
  | StreamingToolResultPart
  | StreamingSourcePart
  | StreamingFilePart

// ─── Reducer ─────────────────────────────────────────────────────────────────

type StreamState = {
  partIds: string[]
  parts: Record<string, StreamingPart>
  isStreaming: boolean
  error: string | null
  finishReason: string | null
  usage: LanguageModelUsage | null
}

type Action =
  | { type: 'start' }
  | { type: 'part-update'; partId: string; part: PartUpdate }
  | { type: 'part-delta'; partId: string; delta: PartDelta }
  | { type: 'finish'; finishReason: string; usage?: LanguageModelUsage }
  | { type: 'error'; error: string }
  | { type: 'reset' }

const INITIAL_STATE: StreamState = {
  partIds: [],
  parts: {},
  isStreaming: false,
  error: null,
  finishReason: null,
  usage: null,
}

function addPart(state: StreamState, partId: string, part: StreamingPart): StreamState {
  if (partId in state.parts) return { ...state, parts: { ...state.parts, [partId]: part } }
  return {
    ...state,
    isStreaming: true,
    partIds: [...state.partIds, partId],
    parts: { ...state.parts, [partId]: part },
  }
}

function updatePart(state: StreamState, partId: string, part: StreamingPart): StreamState {
  if (!(partId in state.parts)) return state
  return { ...state, parts: { ...state.parts, [partId]: part } }
}

function reducer(state: StreamState, action: Action): StreamState {
  switch (action.type) {
    case 'start':
      return { ...state, isStreaming: true }

    case 'part-update': {
      const { partId, part } = action

      switch (part.type) {
        case 'text-start':
          return addPart(state, partId, { type: 'text', id: partId, text: '', status: 'streaming', startedAt: Date.now(), endedAt: null })

        case 'text-end': {
          const existing = state.parts[partId]
          if (!existing || existing.type !== 'text') return state
          return updatePart(state, partId, { ...existing, status: 'complete', endedAt: Date.now() })
        }

        case 'reasoning-start':
          return addPart(state, partId, { type: 'reasoning', id: partId, text: '', status: 'streaming', startedAt: Date.now(), endedAt: null })

        case 'reasoning-end': {
          const existing = state.parts[partId]
          if (!existing || existing.type !== 'reasoning') return state
          return updatePart(state, partId, { ...existing, status: 'complete', endedAt: Date.now() })
        }

        case 'tool-call': {
          const now = Date.now()
          return addPart(state, partId, {
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            startedAt: now,
            endedAt: now,
          })
        }

        case 'tool-result': {
          const now = Date.now()
          return addPart(state, partId, {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: part.output,
            startedAt: now,
            endedAt: now,
          })
        }

        case 'source': {
          // The SDK source stream part is `{ type: 'source' } & LanguageModelV3Source`
          // Strip the `type` field to store just the source data
          const { type: _type, ...sourceData } = part
          const now = Date.now()
          return addPart(state, partId, {
            type: 'source',
            source: sourceData as LanguageModelV3Source,
            startedAt: now,
            endedAt: now,
          })
        }

        case 'file': {
          const now = Date.now()
          return addPart(state, partId, {
            type: 'file',
            data: part.file.base64,
            mediaType: part.file.mediaType,
            startedAt: now,
            endedAt: now,
          })
        }

        default:
          return state
      }
    }

    case 'part-delta': {
      const { partId, delta } = action
      const existing = state.parts[partId]
      if (!existing) return state

      if (delta.type === 'text-delta' && existing.type === 'text') {
        return updatePart(state, partId, { ...existing, text: existing.text + delta.text })
      }
      if (delta.type === 'reasoning-delta' && existing.type === 'reasoning') {
        return updatePart(state, partId, { ...existing, text: existing.text + delta.text })
      }
      return state
    }

    case 'finish':
      return { ...state, isStreaming: false, finishReason: action.finishReason, usage: action.usage ?? null }

    case 'error':
      return { ...state, isStreaming: false, error: action.error }

    case 'reset':
      return INITIAL_STATE

    default:
      return state
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export type ChatStreamState = {
  partIds: string[]
  parts: Record<string, StreamingPart>
  isStreaming: boolean
  error: string | null
  finishReason: string | null
  usage: LanguageModelUsage | null
}

export type UseChatStreamResult = ChatStreamState & {
  activeMessageId: string | null
  setActiveMessageId: (id: string | null) => void
}

export function useChatStream(): UseChatStreamResult {
  const [activeMessageId, setActiveMessageIdState] = React.useState<string | null>(null)
  const [state, dispatch] = React.useReducer(reducer, INITIAL_STATE)

  const activeMessageIdRef = React.useRef<string | null>(null)

  const setActiveMessageId = React.useCallback((id: string | null) => {
    activeMessageIdRef.current = id
    setActiveMessageIdState(id)
    dispatch({ type: 'reset' })
  }, [])

  useSSE({
    'stream-start': (data) => {
      const payload = data as StreamStartPayload
      if (payload.messageId !== activeMessageIdRef.current) return
      dispatch({ type: 'start' })
    },
    'stream-part-update': (data) => {
      const payload = data as StreamPartUpdatePayload
      if (payload.messageId !== activeMessageIdRef.current) return
      dispatch({ type: 'part-update', partId: payload.partId, part: payload.part })
    },
    'stream-part-delta': (data) => {
      const payload = data as StreamPartDeltaPayload
      if (payload.messageId !== activeMessageIdRef.current) return
      if (payload.messageId !== activeMessageIdRef.current) return
      dispatch({ type: 'part-delta', partId: payload.partId, delta: payload.delta })
    },
    'stream-finish': (data) => {
      const payload = data as StreamFinishPayload
      if (payload.messageId !== activeMessageIdRef.current) return
      dispatch({ type: 'finish', finishReason: payload.finishReason, usage: payload.usage })
    },
    'stream-error': (data) => {
      const payload = data as StreamErrorPayload
      if (payload.messageId !== activeMessageIdRef.current) return
      dispatch({ type: 'error', error: payload.error })
    },
  })

  return { ...state, activeMessageId, setActiveMessageId }
}
