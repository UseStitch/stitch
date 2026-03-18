import { streamText, smoothStream } from 'ai';

import type { PrefixedString, StoredPart } from '@openwork/shared';

import { StreamAccumulator } from './stream-accumulator.js';

import type { ToolCallRecord } from './doom-loop.js';
import * as Log from '@/lib/log.js';
import { MAX_RETRIES, sleep, delay, extractErrorInfo, isRetryable } from '@/lib/retry.js';
import * as Sse from '@/lib/sse.js';
import {
  ContextOverflowError,
  getErrorCode,
  isPermissionRejectedError,
  isStreamAbortedError,
  StreamAbortedError,
} from '@/lib/stream-errors.js';
import { createProvider } from '@/provider/provider.js';
import type { createTools } from '@/tools/index.js';
import * as Usage from '@/utils/usage.js';
import type { ModelMessage, LanguageModelUsage } from 'ai';

const log = Log.create({ service: 'step-executor' });

type StepResult = {
  finishReason: string;
  usage: LanguageModelUsage;
  toolCalls: ToolCallRecord[];
  responseMessages: ModelMessage[];
  protocolViolationCount: number;
};

export type StepOptions = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  step: number;
  model: ReturnType<ReturnType<typeof createProvider>>;
  conversation: ModelMessage[];
  accumulatedParts: StoredPart[];
  providerId: string;
  tools: ReturnType<typeof createTools>;
  abortSignal: AbortSignal;
  streamRunId: string;
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
      log.error(
        {
          sessionId,
          messageId,
          streamRunId: opts.streamRunId,
          error,
        },
        'step stream error',
      );
    },
  });

  const toolCalls: ToolCallRecord[] = [];
  const accumulator = new StreamAccumulator(
    sessionId,
    messageId,
    step,
    accumulatedParts,
    toolCalls,
    opts.streamRunId,
  );

  try {
    for await (const part of result.fullStream) {
      if (part.type === 'finish') {
        accumulator.flush();
        return {
          finishReason: part.finishReason,
          usage: part.totalUsage,
          toolCalls,
          responseMessages: (await result.response).messages,
          protocolViolationCount: accumulator.getProtocolViolationCount(),
        };
      }

      await accumulator.handlePart(part);

      if (abortSignal.aborted) {
        throw new StreamAbortedError();
      }
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
    protocolViolationCount: accumulator.getProtocolViolationCount(),
  };
}

export async function executeStepWithRetry(opts: StepOptions): Promise<StepResult> {
  let attempt = 0;

  while (true) {
    try {
      return await executeStep(opts);
    } catch (error) {
      // Don't retry on abort — re-throw immediately
      if (isStreamAbortedError(error)) throw error;
      // Don't retry when user explicitly rejected a tool call
      if (isPermissionRejectedError(error)) throw error;

      attempt++;
      const errorInfo = extractErrorInfo(error, opts.providerId);

      log.error(
        {
          sessionId: opts.sessionId,
          streamRunId: opts.streamRunId,
          messageId: opts.messageId,
          step: opts.step,
          attempt,
          error: errorInfo.message,
          errorCode: getErrorCode(error),
          isContextOverflow: errorInfo.isContextOverflow,
          isRetryable: errorInfo.isRetryable,
        },
        'step error',
      );

      if (errorInfo.isContextOverflow) {
        log.info(
          {
            sessionId: opts.sessionId,
            streamRunId: opts.streamRunId,
            messageId: opts.messageId,
          },
          'context overflow detected, will trigger compaction',
        );
        const overflowError = new ContextOverflowError('context_overflow', { cause: error });
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

      log.info(
        {
          sessionId: opts.sessionId,
          streamRunId: opts.streamRunId,
          messageId: opts.messageId,
          step: opts.step,
          attempt,
          maxRetries: MAX_RETRIES,
          delayMs: waitTime,
          reason: retryMessage,
        },
        'retrying step',
      );

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
