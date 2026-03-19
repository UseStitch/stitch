import { create } from 'zustand';

import type { LanguageModelUsage, LanguageModelV3Source } from '@openwork/shared/chat/messages';
import type { PartDelta, PartUpdate, ToolCallStatus } from '@openwork/shared/chat/realtime';
import type { StreamErrorDetails } from '@openwork/shared/chat/errors';

import { serverFetch } from '@/lib/api';

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
  input: unknown | null;
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

// ─── Per-session stream state ────────────────────────────────────────────────

export type SessionStreamState = {
  activeMessageId: string | null;
  partIds: string[];
  parts: Record<string, StreamingPart>;
  isStreaming: boolean;
  error: { message: string; details?: StreamErrorDetails } | null;
  finishReason: string | null;
  usage: LanguageModelUsage | null;
  retry: RetryInfo | null;
  doomLoop: DoomLoopInfo | null;
};

export const INITIAL_SESSION_STATE: SessionStreamState = {
  activeMessageId: null,
  partIds: [],
  parts: {},
  isStreaming: false,
  error: null,
  finishReason: null,
  usage: null,
  retry: null,
  doomLoop: null,
};

// ─── Store shape ─────────────────────────────────────────────────────────────

type StreamStoreState = {
  sessions: Record<string, SessionStreamState>;
};

type StreamStoreActions = {
  startStream: (sessionId: string, messageId: string) => void;
  applyStreamStart: (sessionId: string, messageId: string) => void;
  applyPartUpdate: (sessionId: string, messageId: string, partId: string, part: PartUpdate) => void;
  applyPartDelta: (sessionId: string, messageId: string, partId: string, delta: PartDelta) => void;
  applyToolState: (
    sessionId: string,
    messageId: string,
    toolCallId: string,
    toolName: string,
    status: ToolCallStatus,
    input?: unknown,
    output?: unknown,
    error?: string,
  ) => void;
  applyToolInputDelta: (
    sessionId: string,
    messageId: string,
    toolCallId: string,
    toolName: string,
    inputTextDelta: string,
  ) => void;
  finishStream: (
    sessionId: string,
    messageId: string,
    finishReason: string,
    usage?: LanguageModelUsage,
  ) => void;
  errorStream: (
    sessionId: string,
    messageId: string,
    error: string,
    details?: StreamErrorDetails,
  ) => void;
  retryStream: (sessionId: string, messageId: string, retry: RetryInfo) => void;
  doomLoopDetected: (
    sessionId: string,
    messageId: string,
    toolName: string,
    consecutiveCount: number,
  ) => void;
  resetSession: (sessionId: string) => void;
  abortStream: (sessionId: string) => Promise<void>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSession(
  sessions: Record<string, SessionStreamState>,
  sessionId: string,
): SessionStreamState | null {
  return sessions[sessionId] ?? null;
}

function guardMessage(session: SessionStreamState | null, messageId: string): boolean {
  return session !== null && session.activeMessageId === messageId;
}

function addPart(
  session: SessionStreamState,
  partId: string,
  part: StreamingPart,
): SessionStreamState {
  if (partId in session.parts) return { ...session, parts: { ...session.parts, [partId]: part } };
  return {
    ...session,
    isStreaming: true,
    partIds: [...session.partIds, partId],
    parts: { ...session.parts, [partId]: part },
  };
}

function updatePart(
  session: SessionStreamState,
  partId: string,
  part: StreamingPart,
): SessionStreamState {
  if (!(partId in session.parts)) return session;
  return { ...session, parts: { ...session.parts, [partId]: part } };
}

function applyPartUpdateToSession(
  session: SessionStreamState,
  partId: string,
  part: PartUpdate,
): SessionStreamState {
  switch (part.type) {
    case 'text-start':
      return addPart(session, partId, {
        type: 'text',
        id: partId,
        text: '',
        hasContent: false,
        status: 'streaming',
        startedAt: Date.now(),
        endedAt: null,
      });

    case 'text-end': {
      const existing = session.parts[partId];
      if (!existing || existing.type !== 'text') return session;
      return updatePart(session, partId, { ...existing, status: 'complete', endedAt: Date.now() });
    }

    case 'reasoning-start':
      return addPart(session, partId, {
        type: 'reasoning',
        id: partId,
        text: '',
        hasContent: false,
        status: 'streaming',
        startedAt: Date.now(),
        endedAt: null,
      });

    case 'reasoning-end': {
      const existing = session.parts[partId];
      if (!existing || existing.type !== 'reasoning') return session;
      return updatePart(session, partId, { ...existing, status: 'complete', endedAt: Date.now() });
    }

    case 'tool-call': {
      const existing = session.parts[partId];
      if (existing && existing.type === 'tool-call') {
        return updatePart(session, partId, { ...existing, input: part.input });
      }
      return addPart(session, partId, {
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

    case 'tool-result':
      return session;

    case 'source': {
      const { type: _type, ...sourceData } = part;
      const now = Date.now();
      return addPart(session, partId, {
        type: 'source',
        source: sourceData as LanguageModelV3Source,
        startedAt: now,
        endedAt: now,
      });
    }

    case 'file': {
      const now = Date.now();
      return addPart(session, partId, {
        type: 'file',
        data: part.file.base64,
        mediaType: part.file.mediaType,
        startedAt: now,
        endedAt: now,
      });
    }

    default:
      return session;
  }
}

function applyPartDeltaToSession(
  session: SessionStreamState,
  partId: string,
  delta: PartDelta,
): SessionStreamState {
  const existing = session.parts[partId];
  if (!existing) return session;

  if (delta.type === 'text-delta' && existing.type === 'text') {
    return updatePart(session, partId, {
      ...existing,
      text: existing.text + delta.text,
      hasContent: true,
    });
  }
  if (delta.type === 'reasoning-delta' && existing.type === 'reasoning') {
    return updatePart(session, partId, {
      ...existing,
      text: existing.text + delta.text,
      hasContent: true,
    });
  }
  return session;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useStreamStore = create<StreamStoreState & StreamStoreActions>()((set) => ({
  sessions: {},

  startStream: (sessionId, messageId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...INITIAL_SESSION_STATE,
          activeMessageId: messageId,
        },
      },
    })),

  applyStreamStart: (sessionId, messageId) =>
    set((state) => {
      const session = getSession(state.sessions, sessionId);
      if (!guardMessage(session, messageId)) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session!, isStreaming: true, retry: null, doomLoop: null },
        },
      };
    }),

  applyPartUpdate: (sessionId, messageId, partId, part) =>
    set((state) => {
      const session = getSession(state.sessions, sessionId);
      if (!guardMessage(session, messageId)) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: applyPartUpdateToSession(session!, partId, part),
        },
      };
    }),

  applyPartDelta: (sessionId, messageId, partId, delta) =>
    set((state) => {
      const session = getSession(state.sessions, sessionId);
      if (!guardMessage(session, messageId)) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: applyPartDeltaToSession(session!, partId, delta),
        },
      };
    }),

  applyToolState: (sessionId, messageId, toolCallId, toolName, status, input, output, error) =>
    set((state) => {
      const session = getSession(state.sessions, sessionId);
      if (!guardMessage(session, messageId)) return state;

      const existing = session!.parts[toolCallId];

      if (existing && existing.type === 'tool-call') {
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: updatePart(session!, toolCallId, {
              ...existing,
              status,
              ...(input !== undefined && { input }),
              ...(output !== undefined && { output }),
              ...(error !== undefined && { error }),
              ...(status === 'completed' || status === 'error' ? { endedAt: Date.now() } : {}),
            }),
          },
        };
      }

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: addPart(session!, toolCallId, {
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
          }),
        },
      };
    }),

  applyToolInputDelta: (sessionId, messageId, toolCallId, toolName, inputTextDelta) =>
    set((state) => {
      const session = getSession(state.sessions, sessionId);
      if (!guardMessage(session, messageId)) return state;

      const existing = session!.parts[toolCallId];

      if (existing && existing.type === 'tool-call') {
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: updatePart(session!, toolCallId, {
              ...existing,
              partialInput: existing.partialInput + inputTextDelta,
            }),
          },
        };
      }

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: addPart(session!, toolCallId, {
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
          }),
        },
      };
    }),

  finishStream: (sessionId, messageId, finishReason, usage) =>
    set((state) => {
      const session = getSession(state.sessions, sessionId);
      if (!guardMessage(session, messageId)) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session!,
            isStreaming: false,
            finishReason,
            usage: usage ?? null,
            retry: null,
            doomLoop: null,
          },
        },
      };
    }),

  errorStream: (sessionId, messageId, error, details) =>
    set((state) => {
      const session = getSession(state.sessions, sessionId);
      if (!guardMessage(session, messageId)) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session!,
            isStreaming: false,
            error: { message: error, details },
            retry: null,
            doomLoop: null,
          },
        },
      };
    }),

  retryStream: (sessionId, messageId, retry) =>
    set((state) => {
      const session = getSession(state.sessions, sessionId);
      if (!guardMessage(session, messageId)) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session!, retry },
        },
      };
    }),

  doomLoopDetected: (sessionId, messageId, toolName, consecutiveCount) =>
    set((state) => {
      const session = getSession(state.sessions, sessionId);
      if (!guardMessage(session, messageId)) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session!,
            doomLoop: { toolName, consecutiveCount },
          },
        },
      };
    }),

  resetSession: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.sessions;
      return { sessions: rest };
    }),

  abortStream: async (sessionId) => {
    // Optimistically mark as no longer streaming
    set((state) => {
      const session = getSession(state.sessions, sessionId);
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, isStreaming: false },
        },
      };
    });
    await serverFetch(`/chat/sessions/${sessionId}/abort`, { method: 'POST' });
  },
}));
