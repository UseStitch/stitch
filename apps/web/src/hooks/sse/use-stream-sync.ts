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
    applyToolInputDelta,
    finishStream,
    errorStream,
    retryStream,
    doomLoopDetected,
  } = useStreamStore.getState();

  useSSE({
    'stream-start': (data) => {
      const { sessionId, messageId } = data;
      applyStreamStart(sessionId, messageId);
    },
    'stream-part-update': (data) => {
      const { sessionId, messageId, partId, part } = data;
      applyPartUpdate(sessionId, messageId, partId, part);
    },
    'stream-part-delta': (data) => {
      const { sessionId, messageId, partId, delta } = data;
      applyPartDelta(sessionId, messageId, partId, delta);
    },
    'stream-tool-input-delta': (data) => {
      const { sessionId, messageId, toolCallId, toolName, inputTextDelta } = data;
      applyToolInputDelta(sessionId, messageId, toolCallId, toolName, inputTextDelta);
    },
    'stream-tool-state': (data) => {
      const { sessionId, messageId, toolCallId, toolName, status, input, output, error } = data;
      applyToolState(sessionId, messageId, toolCallId, toolName, status, input, output, error);
    },
    'stream-finish': (data) => {
      const { sessionId, messageId, finishReason, usage } = data;
      finishStream(sessionId, messageId, finishReason, usage);
    },
    'stream-error': (data) => {
      const { sessionId, messageId, error, details } = data;
      errorStream(sessionId, messageId, error, details);
    },
    'stream-retry': (data) => {
      const { sessionId, messageId, attempt, maxRetries, delayMs, message } = data;
      retryStream(sessionId, messageId, {
        attempt,
        maxRetries,
        delayMs,
        message,
        nextRetryAt: Date.now() + delayMs,
      });
    },
    'doom-loop-detected': (data) => {
      const { sessionId, messageId, toolName, consecutiveCount } = data;
      doomLoopDetected(sessionId, messageId, toolName, consecutiveCount);
    },
  });
}

/** Render-less component that wires SSE events into the Zustand store. */
export function StreamSync() {
  useStreamSync();
  return null;
}
