import * as React from 'react';
import type { LanguageModelUsage, LanguageModelV3Source } from '@openwork/shared';
import type {
  PartDelta,
  PartUpdate,
  StreamErrorPayload,
  StreamFinishPayload,
  StreamPartDeltaPayload,
  StreamPartUpdatePayload,
  StreamRetryPayload,
  StreamStartPayload,
  StreamToolStatePayload,
  StreamToolInputDeltaPayload,
  DoomLoopDetectedPayload,
  ToolCallStatus,
} from '@openwork/shared';
import { useSSE } from '@/hooks/sse/use-sse';

// ─── Streaming part types (FE in-flight state) ────────────────────────────────

export type StreamingTextPart = {
  type: 'text';
  id: string;
  text: string;
  hasContent: boolean;
  status: 'streaming' | 'complete';
  startedAt: number;
  endedAt: number | null;
};

export type StreamingReasoningPart = {
  type: 'reasoning';
  id: string;
  text: string;
  hasContent: boolean;
  status: 'streaming' | 'complete';
  startedAt: number;
  endedAt: number | null;
};

export type StreamingToolCallPart = {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  /** Fully-parsed input once tool-call fires; null while args are still streaming. */
  input: unknown | null;
  /** Raw streamed arg text accumulated from tool-input-delta events. */
  partialInput: string;
  status: ToolCallStatus;
  output: unknown | null;
  error: string | null;
  startedAt: number;
  endedAt: number | null;
};

export type StreamingSourcePart = {
  type: 'source';
  source: LanguageModelV3Source;
  startedAt: number;
  endedAt: number;
};

export type StreamingFilePart = {
  type: 'file';
  data: string;
  mediaType: string;
  startedAt: number;
  endedAt: number;
};

export type RetryInfo = {
  attempt: number;
  maxRetries: number;
  delayMs: number;
  message: string;
  nextRetryAt: number;
};

export type DoomLoopInfo = {
  toolName: string;
  consecutiveCount: number;
};

export type StreamingPart =
  | StreamingTextPart
  | StreamingReasoningPart
  | StreamingToolCallPart
  | StreamingSourcePart
  | StreamingFilePart;

// ─── Reducer ─────────────────────────────────────────────────────────────────

type StreamState = {
  partIds: string[];
  parts: Record<string, StreamingPart>;
  isStreaming: boolean;
  error: string | null;
  finishReason: string | null;
  usage: LanguageModelUsage | null;
  retry: RetryInfo | null;
  doomLoop: DoomLoopInfo | null;
};

type Action =
  | { type: 'start' }
  | { type: 'part-update'; partId: string; part: PartUpdate }
  | { type: 'part-delta'; partId: string; delta: PartDelta }
  | {
      type: 'tool-state';
      toolCallId: string;
      status: ToolCallStatus;
      toolName: string;
      input?: unknown;
      output?: unknown;
      error?: string;
    }
  | { type: 'tool-input-delta'; toolCallId: string; toolName: string; inputTextDelta: string }
  | { type: 'finish'; finishReason: string; usage?: LanguageModelUsage }
  | { type: 'error'; error: string }
  | { type: 'retry'; retry: RetryInfo }
  | { type: 'doom-loop'; toolName: string; consecutiveCount: number }
  | { type: 'reset' };

const INITIAL_STATE: StreamState = {
  partIds: [],
  parts: {},
  isStreaming: false,
  error: null,
  finishReason: null,
  usage: null,
  retry: null,
  doomLoop: null,
};

function addPart(state: StreamState, partId: string, part: StreamingPart): StreamState {
  if (partId in state.parts) return { ...state, parts: { ...state.parts, [partId]: part } };
  return {
    ...state,
    isStreaming: true,
    partIds: [...state.partIds, partId],
    parts: { ...state.parts, [partId]: part },
  };
}

function updatePart(state: StreamState, partId: string, part: StreamingPart): StreamState {
  if (!(partId in state.parts)) return state;
  return { ...state, parts: { ...state.parts, [partId]: part } };
}

function reducer(state: StreamState, action: Action): StreamState {
  switch (action.type) {
    case 'start':
      return { ...state, isStreaming: true, retry: null, doomLoop: null };

    case 'part-update': {
      const { partId, part } = action;

      switch (part.type) {
        case 'text-start':
          return addPart(state, partId, {
            type: 'text',
            id: partId,
            text: '',
            hasContent: false,
            status: 'streaming',
            startedAt: Date.now(),
            endedAt: null,
          });

        case 'text-end': {
          const existing = state.parts[partId];
          if (!existing || existing.type !== 'text') return state;
          return updatePart(state, partId, {
            ...existing,
            status: 'complete',
            endedAt: Date.now(),
          });
        }

        case 'reasoning-start':
          return addPart(state, partId, {
            type: 'reasoning',
            id: partId,
            text: '',
            hasContent: false,
            status: 'streaming',
            startedAt: Date.now(),
            endedAt: null,
          });

        case 'reasoning-end': {
          const existing = state.parts[partId];
          if (!existing || existing.type !== 'reasoning') return state;
          return updatePart(state, partId, {
            ...existing,
            status: 'complete',
            endedAt: Date.now(),
          });
        }

        // tool-call updates parsed input for existing 'pending' part; status remains 'pending'.
        case 'tool-call': {
          const existing = state.parts[partId];
          if (existing && existing.type === 'tool-call') {
            return updatePart(state, partId, {
              ...existing,
              input: part.input,
            });
          }
          // Fallback: create the part if pending event hadn't arrived yet
          return addPart(state, partId, {
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            partialInput: '',
            status: 'pending',
            output: null,
            error: null,
            startedAt: Date.now(),
            endedAt: null,
          });
        }

        // tool-result is no longer sent as a separate stream part in our loop —
        // we track it via stream-tool-state completed. Keep as a no-op.
        case 'tool-result':
          return state;

        case 'source': {
          const { type: _type, ...sourceData } = part;
          const now = Date.now();
          return addPart(state, partId, {
            type: 'source',
            source: sourceData as LanguageModelV3Source,
            startedAt: now,
            endedAt: now,
          });
        }

        case 'file': {
          const now = Date.now();
          return addPart(state, partId, {
            type: 'file',
            data: part.file.base64,
            mediaType: part.file.mediaType,
            startedAt: now,
            endedAt: now,
          });
        }

        default:
          return state;
      }
    }

    case 'part-delta': {
      const { partId, delta } = action;
      const existing = state.parts[partId];
      if (!existing) return state;

      if (delta.type === 'text-delta' && existing.type === 'text') {
        return updatePart(state, partId, {
          ...existing,
          text: existing.text + delta.text,
          hasContent: true,
        });
      }
      if (delta.type === 'reasoning-delta' && existing.type === 'reasoning') {
        return updatePart(state, partId, {
          ...existing,
          text: existing.text + delta.text,
          hasContent: true,
        });
      }
      return state;
    }

    // ── Tool lifecycle events ────────────────────────────────────────────────

    case 'tool-input-delta': {
      const { toolCallId, toolName, inputTextDelta } = action;
      const existing = state.parts[toolCallId];

      if (existing && existing.type === 'tool-call') {
        return updatePart(state, toolCallId, {
          ...existing,
          partialInput: existing.partialInput + inputTextDelta,
        });
      }

      // First delta arrived before tool-state pending — create the part now
      return addPart(state, toolCallId, {
        type: 'tool-call',
        toolCallId,
        toolName,
        input: null,
        partialInput: inputTextDelta,
        status: 'pending',
        output: null,
        error: null,
        startedAt: Date.now(),
        endedAt: null,
      });
    }

    case 'tool-state': {
      const { toolCallId, toolName, status, input, output, error } = action;
      const existing = state.parts[toolCallId];

      if (existing && existing.type === 'tool-call') {
        return updatePart(state, toolCallId, {
          ...existing,
          status,
          ...(input !== undefined && { input }),
          ...(output !== undefined && { output }),
          ...(error !== undefined && { error }),
          ...(status === 'completed' || status === 'error' ? { endedAt: Date.now() } : {}),
        });
      }

      // tool-state arrived before any input-delta (e.g. non-streaming provider)
      return addPart(state, toolCallId, {
        type: 'tool-call',
        toolCallId,
        toolName,
        input: input ?? null,
        partialInput: '',
        status,
        output: output ?? null,
        error: error ?? null,
        startedAt: Date.now(),
        endedAt: status === 'completed' || status === 'error' ? Date.now() : null,
      });
    }

    case 'finish':
      return {
        ...state,
        isStreaming: false,
        finishReason: action.finishReason,
        usage: action.usage ?? null,
        retry: null,
        doomLoop: null,
      };

    case 'error':
      return { ...state, isStreaming: false, error: action.error, retry: null, doomLoop: null };

    case 'retry':
      return { ...state, retry: action.retry };

    case 'doom-loop':
      return {
        ...state,
        doomLoop: { toolName: action.toolName, consecutiveCount: action.consecutiveCount },
      };

    case 'reset':
      return INITIAL_STATE;

    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export type ChatStreamState = {
  partIds: string[];
  parts: Record<string, StreamingPart>;
  isStreaming: boolean;
  error: string | null;
  finishReason: string | null;
  usage: LanguageModelUsage | null;
  retry: RetryInfo | null;
  doomLoop: DoomLoopInfo | null;
};

export type UseChatStreamResult = ChatStreamState & {
  activeMessageId: string | null;
  setActiveMessageId: (id: string | null) => void;
};

export function useChatStream(): UseChatStreamResult {
  const [activeMessageId, setActiveMessageIdState] = React.useState<string | null>(null);
  const [state, dispatch] = React.useReducer(reducer, INITIAL_STATE);

  const activeMessageIdRef = React.useRef<string | null>(null);

  const setActiveMessageId = React.useCallback((id: string | null) => {
    activeMessageIdRef.current = id;
    setActiveMessageIdState(id);
    dispatch({ type: 'reset' });
  }, []);

  useSSE({
    'stream-start': (data) => {
      const payload = data as StreamStartPayload;
      if (payload.messageId !== activeMessageIdRef.current) return;
      dispatch({ type: 'start' });
    },
    'stream-part-update': (data) => {
      const payload = data as StreamPartUpdatePayload;
      if (payload.messageId !== activeMessageIdRef.current) return;
      dispatch({ type: 'part-update', partId: payload.partId, part: payload.part });
    },
    'stream-part-delta': (data) => {
      const payload = data as StreamPartDeltaPayload;
      if (payload.messageId !== activeMessageIdRef.current) return;
      dispatch({ type: 'part-delta', partId: payload.partId, delta: payload.delta });
    },
    'stream-tool-input-delta': (data) => {
      const payload = data as StreamToolInputDeltaPayload;
      if (payload.messageId !== activeMessageIdRef.current) return;
      dispatch({
        type: 'tool-input-delta',
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        inputTextDelta: payload.inputTextDelta,
      });
    },
    'stream-tool-state': (data) => {
      const payload = data as StreamToolStatePayload;
      if (payload.messageId !== activeMessageIdRef.current) return;
      dispatch({
        type: 'tool-state',
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        status: payload.status,
        input: payload.input,
        output: payload.output,
        error: payload.error,
      });
    },
    'stream-finish': (data) => {
      const payload = data as StreamFinishPayload;
      if (payload.messageId !== activeMessageIdRef.current) return;
      dispatch({ type: 'finish', finishReason: payload.finishReason, usage: payload.usage });
    },
    'stream-error': (data) => {
      const payload = data as StreamErrorPayload;
      if (payload.messageId !== activeMessageIdRef.current) return;
      dispatch({ type: 'error', error: payload.error });
    },
    'stream-retry': (data) => {
      const payload = data as StreamRetryPayload;
      if (payload.messageId !== activeMessageIdRef.current) return;
      dispatch({
        type: 'retry',
        retry: {
          attempt: payload.attempt,
          maxRetries: payload.maxRetries,
          delayMs: payload.delayMs,
          message: payload.message,
          nextRetryAt: Date.now() + payload.delayMs,
        },
      });
    },
    'doom-loop-detected': (data) => {
      const payload = data as DoomLoopDetectedPayload;
      if (payload.messageId !== activeMessageIdRef.current) return;
      dispatch({
        type: 'doom-loop',
        toolName: payload.toolName,
        consecutiveCount: payload.consecutiveCount,
      });
    },
  });

  return { ...state, activeMessageId, setActiveMessageId };
}
