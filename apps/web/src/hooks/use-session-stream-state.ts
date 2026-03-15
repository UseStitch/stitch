import { useCallback, useRef } from 'react';

import { useStreamStore, INITIAL_SESSION_STATE } from '@/stores/stream-store';
import type { SessionStreamState } from '@/stores/stream-store';

/**
 * Subscribe to a single session's streaming state.
 * Components only re-render when that session's slice changes.
 *
 * Returns a referentially-stable object: either the existing session
 * entry (already stable per Zustand update) or the shared
 * INITIAL_SESSION_STATE constant when no entry exists.
 */
export function useSessionStreamState(sessionId: string): SessionStreamState {
  return useStreamStore(
    useCallback(
      (state: { sessions: Record<string, SessionStreamState> }) =>
        state.sessions[sessionId] ?? INITIAL_SESSION_STATE,
      [sessionId],
    ),
  );
}

/**
 * Derive the list of session IDs that are currently streaming.
 * Returns a referentially-stable array — only produces a new reference
 * when the set of streaming IDs actually changes.
 */
export function useStreamingSessionIds(): string[] {
  const prevRef = useRef<string[]>([]);

  return useStreamStore((state) => {
    const next: string[] = [];
    for (const [id, session] of Object.entries(state.sessions)) {
      if (session.isStreaming) next.push(id);
    }

    const prev = prevRef.current;
    if (prev.length === next.length && prev.every((id, i) => id === next[i])) {
      return prev;
    }
    prevRef.current = next;
    return next;
  });
}
