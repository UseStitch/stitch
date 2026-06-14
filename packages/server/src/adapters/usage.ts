import { internalBus } from '@/lib/internal-bus.js';
import { recordLlmUsage } from '@/usage/ledger.js';

/**
 * Registers usage tracking subscriptions on the internal bus.
 * Reacts to stream lifecycle events and records usage to the database.
 */
export function registerUsageAdapter(): void {
  internalBus.on('stream.step.completed', async (event) => {
    await recordLlmUsage({
      runId: event.streamRunId,
      source: 'chat',
      status: 'succeeded',
      sessionId: event.sessionId,
      messageId: event.messageId,
      providerId: event.providerId,
      modelId: event.modelId,
      usage: event.usage,
      stepIndex: event.step,
      attemptIndex: event.attemptCount,
      metadata: {
        phase: 'chat-step',
        eventType: 'step-success',
        finishReason: event.finishReason,
      },
      startedAt: event.startedAt,
      endedAt: event.startedAt + event.durationMs,
      durationMs: event.durationMs,
    });
  });

  internalBus.on('usage.step.failed', async (event) => {
    const now = Date.now();
    await recordLlmUsage({
      runId: event.streamRunId,
      source: 'chat',
      status: 'failed',
      sessionId: event.sessionId,
      messageId: event.messageId,
      providerId: event.providerId,
      modelId: event.modelId,
      errorCode: event.errorCode,
      stepIndex: event.step,
      attemptIndex: event.attempt,
      metadata: {
        phase: 'chat-step',
        eventType: 'attempt-failure',
        streamRunId: event.streamRunId,
        isRetryable: event.isRetryable,
      },
      startedAt: now,
      endedAt: now,
      durationMs: 0,
    });
  });

  internalBus.on('usage.doom_loop.failed', async (event) => {
    const now = Date.now();
    await recordLlmUsage({
      runId: event.streamRunId,
      source: 'doom_loop_summary',
      status: 'failed',
      sessionId: event.sessionId,
      messageId: event.messageId,
      providerId: event.providerId,
      modelId: event.modelId,
      errorCode: event.errorCode,
      attemptIndex: event.attempt,
      metadata: {
        phase: 'doom-loop',
        eventType: 'attempt-failure',
        streamRunId: event.streamRunId,
        isRetryable: event.isRetryable,
      },
      startedAt: now,
      endedAt: now,
      durationMs: 0,
    });
  });

  internalBus.on('usage.doom_loop.summary', async (event) => {
    const now = Date.now();
    await recordLlmUsage({
      runId: event.streamRunId,
      source: 'doom_loop_summary',
      status: 'succeeded',
      sessionId: event.sessionId,
      messageId: event.messageId,
      providerId: event.providerId,
      modelId: event.modelId,
      usage: event.usage,
      metadata: {
        phase: 'doom-loop',
        eventType: 'summary-after-stop',
      },
      startedAt: now,
      endedAt: now,
      durationMs: 0,
    });
  });
}
