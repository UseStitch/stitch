import { useSSE } from '@/hooks/sse/sse-context';
import { useStreamStore } from '@/stores/stream-store';

/**
 * Global SSE-to-Zustand bridge.
 *
 * Mount once at the root layout. Routes every incoming stream event
 * into the per-session Zustand store so all sessions accumulate
 * state concurrently, regardless of which session is currently viewed.
 */
function useStreamSync(): void {
  const {
    applyStreamStart,
    applyPartUpdate,
    applyPartDelta,
    applyToolState,
    finishStream,
    errorStream,
    retryStream,
    doomLoopDetected,
  } = useStreamStore.getState();

  useSSE({
    'stream-start': ({ sessionId, messageId }) => {
      applyStreamStart(sessionId, messageId);
    },
    'stream-part-update': ({ sessionId, messageId, partId, part }) => {
      applyPartUpdate(sessionId, messageId, partId, part);
    },
    'stream-part-delta': ({ sessionId, messageId, partId, delta }) => {
      applyPartDelta(sessionId, messageId, partId, delta);
    },
    'stream-tool-state': ({ sessionId, messageId, toolCallId, toolName, status, input, output, error }) => {
      applyToolState(sessionId, messageId, toolCallId, toolName, status, input, output, error);
    },
    'stream-finish': ({ sessionId, messageId, finishReason, usage }) => {
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
