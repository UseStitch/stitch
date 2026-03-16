import { streamText, smoothStream } from 'ai';

import type { StoredPart } from '@openwork/shared';

import { StreamAccumulator } from './stream-accumulator.js';

import type { ToolCallRecord } from './doom-loop.js';
import * as Log from '@/lib/log.js';
import { MAX_RETRIES, sleep, delay, extractErrorInfo, isRetryable } from '@/lib/retry.js';
import * as Sse from '@/lib/sse.js';
import { createProvider } from '@/provider/provider.js';
import type { createTools } from '@/tools/index.js';
import * as Usage from '@/utils/usage.js';
import type { ModelMessage, LanguageModelUsage } from 'ai';

const log = Log.create({ service: 'step-executor' });

function isPermissionRejectedError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('User rejected tool execution for ');
}

type StepResult = {
  finishReason: string;
  usage: LanguageModelUsage;
  toolCalls: ToolCallRecord[];
  responseMessages: ModelMessage[];
};

export type StepOptions = {
  sessionId: string;
  messageId: string;
  step: number;
  model: ReturnType<ReturnType<typeof createProvider>>;
  conversation: ModelMessage[];
  accumulatedParts: StoredPart[];
  providerId: string;
  tools: ReturnType<typeof createTools>;
  abortSignal: AbortSignal;
};

async function executeStep(opts: StepOptions): Promise<StepResult> {
  const { sessionId, messageId, step, model, conversation, accumulatedParts, tools, abortSignal } =
    opts;

  const result = streamText({
    model,
    messages: conversation,
    tools,
    abortSignal,
    experimental_transform: smoothStream({
      delayInMs: 100,
    }),
    onError: ({ error }) => {
      log.error('step stream error', { sessionId, messageId, error });
    },
  });

  const toolCalls: ToolCallRecord[] = [];
  const accumulator = new StreamAccumulator(
    sessionId,
    messageId,
    step,
    accumulatedParts,
    toolCalls,
  );

  try {
    for await (const part of result.fullStream) {
      if (abortSignal.aborted) {
        throw new DOMException('Stream aborted', 'AbortError');
      }

      if (part.type === 'finish') {
        return {
          finishReason: part.finishReason,
          usage: part.totalUsage,
          toolCalls,
          responseMessages: (await result.response).messages,
        };
      }

      await accumulator.handlePart(part);
    }
  } catch (e) {
    accumulator.flush();
    throw e;
  }

  return {
    finishReason: 'unknown',
    usage: Usage.ZERO_USAGE,
    toolCalls,
    responseMessages: (await result.response).messages,
  };
}

export async function executeStepWithRetry(opts: StepOptions): Promise<StepResult> {
  let attempt = 0;

  while (true) {
    try {
      return await executeStep(opts);
    } catch (error) {
      // Don't retry on abort — re-throw immediately
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      // Don't retry when user explicitly rejected a tool call
      if (isPermissionRejectedError(error)) throw error;

      attempt++;
      const errorInfo = extractErrorInfo(error, opts.providerId);

      log.error('step error', {
        sessionId: opts.sessionId,
        messageId: opts.messageId,
        step: opts.step,
        attempt,
        error: errorInfo.message,
        isContextOverflow: errorInfo.isContextOverflow,
        isRetryable: errorInfo.isRetryable,
      });

      if (errorInfo.isContextOverflow) {
        log.info('context overflow detected, will trigger compaction', {
          sessionId: opts.sessionId,
          messageId: opts.messageId,
        });
        const overflowError = new Error('context_overflow');
        overflowError.cause = error;
        throw overflowError;
      }

      const retryMessage = isRetryable(errorInfo);
      if (!retryMessage || attempt >= MAX_RETRIES) {
        await Sse.broadcast('stream-error', {
          sessionId: opts.sessionId,
          messageId: opts.messageId,
          error: errorInfo.message,
        });
        throw error;
      }

      const waitTime = delay(attempt, errorInfo.responseHeaders);

      log.info('retrying step', {
        sessionId: opts.sessionId,
        messageId: opts.messageId,
        step: opts.step,
        attempt,
        maxRetries: MAX_RETRIES,
        delayMs: waitTime,
        reason: retryMessage,
      });

      await Sse.broadcast('stream-retry', {
        sessionId: opts.sessionId,
        messageId: opts.messageId,
        attempt,
        maxRetries: MAX_RETRIES,
        delayMs: waitTime,
        message: retryMessage,
      });

      await sleep(waitTime, opts.abortSignal);
    }
  }
}
