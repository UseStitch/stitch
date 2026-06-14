import * as Log from '@/lib/log.js';
import { internalBus } from '@/lib/internal-bus.js';
import { processMemories } from '@/memory/processor.js';

const log = Log.create({ service: 'memory-adapter' });

/**
 * Registers memory extraction subscriptions on the internal bus.
 * Reacts to stream completion and triggers fire-and-forget memory processing.
 */
export function registerMemoryAdapter(): void {
  internalBus.on('stream.completed', async (event) => {
    if (!event.userMessage || !event.assistantMessage) return;

    await processMemories({
      sessionId: event.sessionId,
      userMessage: event.userMessage,
      assistantMessage: event.assistantMessage,
      providerId: event.providerId,
      modelId: event.modelId,
    }).catch((error) => {
      log.warn(
        {
          event: 'memory_adapter.processing_failed',
          streamRunId: event.streamRunId,
          sessionId: event.sessionId,
          error,
        },
        'async memory processing failed',
      );
    });
  });
}
