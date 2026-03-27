import { useEffect, useRef } from 'react';

import type { PartDelta } from '@stitch/shared/chat/realtime';

import { useSSE } from '@/hooks/sse/sse-context';
import { useStreamStore } from '@/stores/stream-store';

type PendingDelta = { sessionId: string; messageId: string; partId: string; delta: PartDelta };

/**
 * Global SSE-to-Zustand bridge.
 *
 * Mount once at the root layout. Routes every incoming stream event
 * into the per-session Zustand store so all sessions accumulate
 * state concurrently, regardless of which session is currently viewed.
 *
 * stream-part-delta events are batched per animation frame to reduce
 * React re-render frequency while streaming at high token rates.
 */
function useStreamSync(): void {
  const {
    applyStreamStart,
    applyPartUpdate,
    applyPartDeltas,
    applyToolState,
    finishStream,
    errorStream,
    retryStream,
    doomLoopDetected,
  } = useStreamStore.getState();

  const pendingDeltasRef = useRef<PendingDelta[]>([]);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  useSSE({
    'stream-start': ({ sessionId, messageId }) => {
      applyStreamStart(sessionId, messageId);
    },
    'stream-part-update': ({ sessionId, messageId, partId, part }) => {
      applyPartUpdate(sessionId, messageId, partId, part);
    },
    'stream-part-delta': ({ sessionId, messageId, partId, delta }) => {
      pendingDeltasRef.current.push({ sessionId, messageId, partId, delta });

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          const batch = pendingDeltasRef.current;
          pendingDeltasRef.current = [];

          // Group by session+message to minimise store set() calls
          const groups = new Map<
            string,
            { sessionId: string; messageId: string; deltas: { partId: string; delta: PartDelta }[] }
          >();
          for (const item of batch) {
            const key = `${item.sessionId}:${item.messageId}`;
            let group = groups.get(key);
            if (!group) {
              group = { sessionId: item.sessionId, messageId: item.messageId, deltas: [] };
              groups.set(key, group);
            }
            group.deltas.push({ partId: item.partId, delta: item.delta });
          }

          for (const group of groups.values()) {
            applyPartDeltas(group.sessionId, group.messageId, group.deltas);
          }
        });
      }
    },
    'stream-tool-state': ({
      sessionId,
      messageId,
      toolCallId,
      toolName,
      status,
      input,
      output,
      error,
    }) => {
      applyToolState(sessionId, messageId, toolCallId, toolName, status, input, output, error);
    },
    'stream-finish': ({ sessionId, messageId, finishReason, usage }) => {
      // Flush any pending deltas immediately before finishing
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
        const batch = pendingDeltasRef.current;
        pendingDeltasRef.current = [];
        const groups = new Map<
          string,
          { sessionId: string; messageId: string; deltas: { partId: string; delta: PartDelta }[] }
        >();
        for (const item of batch) {
          const key = `${item.sessionId}:${item.messageId}`;
          let group = groups.get(key);
          if (!group) {
            group = { sessionId: item.sessionId, messageId: item.messageId, deltas: [] };
            groups.set(key, group);
          }
          group.deltas.push({ partId: item.partId, delta: item.delta });
        }
        for (const group of groups.values()) {
          applyPartDeltas(group.sessionId, group.messageId, group.deltas);
        }
      }
      finishStream(sessionId, messageId, finishReason, usage);
    },
    'stream-error': ({ sessionId, messageId, error, details }) => {
      errorStream(sessionId, messageId, error, details);
    },
    'stream-retry': ({ sessionId, messageId, attempt, maxRetries, delayMs, message }) => {
      retryStream(sessionId, messageId, {
        attempt,
        maxRetries,
        delayMs,
        message,
        nextRetryAt: Date.now() + delayMs,
      });
    },
    'doom-loop-detected': ({ sessionId, messageId, toolName, consecutiveCount }) => {
      doomLoopDetected(sessionId, messageId, toolName, consecutiveCount);
    },
  });
}

/** Render-less component that wires SSE events into the Zustand store. */
export function StreamSync() {
  useStreamSync();
  return null;
}
