import type {
  ChatFailedLlmUsageMetadata,
  ChatLlmUsageMetadata,
  DoomLoopFailedLlmUsageMetadata,
  DoomLoopSummaryLlmUsageMetadata,
} from '@/db/schema/usage.js';
import { internalBus } from '@/lib/internal-bus.js';
import { recordLlmUsage } from '@/usage/ledger.js';

/**
 * Registers usage tracking subscriptions on the internal bus.
 * Reacts to stream lifecycle events and records usage to the database.
 */
export function registerUsageAdapter(): void {
  internalBus.on('stream.step.completed', async (event) => {
    const metadata: ChatLlmUsageMetadata = {
      source: 'chat',
      eventType: 'step-success',
      sessionId: event.sessionId,
      messageId: event.messageId,
      stepIndex: event.step,
      attemptIndex: event.attemptCount,
      finishReason: event.finishReason,
    };

    await recordLlmUsage({
      source: 'chat',
      status: 'succeeded',
      providerId: event.providerId,
      modelId: event.modelId,
      usage: event.usage,
      metadata,
      startedAt: event.startedAt,
      endedAt: event.startedAt + event.durationMs,
      durationMs: event.durationMs,
    });
  });

  internalBus.on('usage.step.failed', async (event) => {
    const metadata: ChatFailedLlmUsageMetadata = {
      source: 'chat',
      eventType: 'attempt-failure',
      sessionId: event.sessionId,
      messageId: event.messageId,
      stepIndex: event.step,
      attemptIndex: event.attempt,
      streamRunId: event.streamRunId,
      isRetryable: event.isRetryable,
    };

    await recordLlmUsage({
      source: 'chat',
      status: 'failed',
      providerId: event.providerId,
      modelId: event.modelId,
      errorCode: event.errorCode,
      metadata,
      startedAt: Date.now(),
    });
  });

  internalBus.on('usage.doom_loop.failed', async (event) => {
    const metadata: DoomLoopFailedLlmUsageMetadata = {
      source: 'doom_loop_summary',
      eventType: 'attempt-failure',
      sessionId: event.sessionId,
      messageId: event.messageId,
      streamRunId: event.streamRunId,
      isRetryable: event.isRetryable,
    };

    await recordLlmUsage({
      source: 'doom_loop_summary',
      status: 'failed',
      providerId: event.providerId,
      modelId: event.modelId,
      errorCode: event.errorCode,
      metadata,
      startedAt: Date.now(),
    });
  });

  internalBus.on('usage.doom_loop.summary', async (event) => {
    const metadata: DoomLoopSummaryLlmUsageMetadata = {
      source: 'doom_loop_summary',
      eventType: 'summary-after-stop',
      sessionId: event.sessionId,
      messageId: event.messageId,
    };

    await recordLlmUsage({
      source: 'doom_loop_summary',
      status: 'succeeded',
      providerId: event.providerId,
      modelId: event.modelId,
      usage: event.usage,
      metadata,
      startedAt: Date.now(),
    });
  });
}
