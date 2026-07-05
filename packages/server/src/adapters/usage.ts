import type { PrefixedString } from '@stitch/shared/id';

import { internalBus } from '@/lib/internal-bus.js';
import { recordLlmUsage } from '@/usage/ledger.js';
import type { LanguageModelUsage } from 'ai';

type UsageBase = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
  providerId: string;
  modelId: string;
};

function recordUsage(
  event: UsageBase,
  opts: {
    source: string;
    status: 'succeeded' | 'failed';
    metadata: Record<string, unknown>;
    usage?: LanguageModelUsage;
    errorCode?: string;
    stepIndex?: number;
    attemptIndex?: number;
    startedAt?: number;
    endedAt?: number;
    durationMs?: number;
  },
): Promise<{ costUsd: number }> {
  const now = Date.now();
  return recordLlmUsage({
    runId: event.streamRunId,
    sessionId: event.sessionId,
    messageId: event.messageId,
    providerId: event.providerId,
    modelId: event.modelId,
    source: opts.source,
    status: opts.status,
    metadata: opts.metadata,
    usage: opts.usage,
    errorCode: opts.errorCode,
    stepIndex: opts.stepIndex,
    attemptIndex: opts.attemptIndex,
    startedAt: opts.startedAt ?? now,
    endedAt: opts.endedAt ?? now,
    durationMs: opts.durationMs ?? 0,
  });
}

/**
 * Registers usage tracking subscriptions on the internal bus.
 * Reacts to stream lifecycle events and records usage to the database.
 */
export function registerUsageAdapter(): void {
  internalBus.on('stream.step.completed', async (event) => {
    await recordUsage(event, {
      source: 'chat',
      status: 'succeeded',
      usage: event.usage,
      stepIndex: event.step,
      attemptIndex: event.attemptCount,
      metadata: { phase: 'chat-step', eventType: 'step-success', finishReason: event.finishReason },
      startedAt: event.startedAt,
      endedAt: event.startedAt + event.durationMs,
      durationMs: event.durationMs,
    });
  });

  internalBus.on('usage.step.failed', async (event) => {
    await recordUsage(event, {
      source: 'chat',
      status: 'failed',
      errorCode: event.errorCode,
      stepIndex: event.step,
      attemptIndex: event.attempt,
      metadata: {
        phase: 'chat-step',
        eventType: 'attempt-failure',
        streamRunId: event.streamRunId,
        isRetryable: event.isRetryable,
      },
    });
  });

  internalBus.on('usage.doom_loop.failed', async (event) => {
    await recordUsage(event, {
      source: 'doom_loop_summary',
      status: 'failed',
      errorCode: event.errorCode,
      attemptIndex: event.attempt,
      metadata: {
        phase: 'doom-loop',
        eventType: 'attempt-failure',
        streamRunId: event.streamRunId,
        isRetryable: event.isRetryable,
      },
    });
  });

  internalBus.on('usage.doom_loop.summary', async (event) => {
    await recordUsage(event, {
      source: 'doom_loop_summary',
      status: 'succeeded',
      usage: event.usage,
      metadata: { phase: 'doom-loop', eventType: 'summary-after-stop' },
    });
  });
}
