import { streamText, smoothStream } from 'ai';

import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';
import type { ProviderId } from '@stitch/shared/providers/types';

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
import { addCacheControlToMessages, getProviderOptions } from '@/llm/cache-control.js';
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
  const initialPartCount = accumulatedParts.length;

  log.info(
    {
      event: 'stream.step.execute.started',
      sessionId,
      messageId,
      streamRunId: opts.streamRunId,
      providerId: opts.providerId,
      step,
      conversationMessageCount: conversation.length,
      accumulatedPartCount: accumulatedParts.length,
    },
    'step execution started',
  );

  const cachedMessages = addCacheControlToMessages(
    conversation,
    opts.providerId as ProviderId,
    model.modelId,
  );
  const providerOptions = getProviderOptions(opts.providerId as ProviderId, opts.sessionId);

  const result = streamText({
    model,
    messages: cachedMessages,
    tools,
    providerOptions,
    experimental_repairToolCall: async (failed) => {
      const toolName = String(failed.toolCall.toolName ?? '');
      const normalizedToolName = toolName.toLowerCase();
      if (normalizedToolName !== toolName && normalizedToolName in tools) {
        log.info(
          {
            event: 'stream.tool_call.repaired',
            sessionId,
            messageId,
            streamRunId: opts.streamRunId,
            providerId: opts.providerId,
            step,
            from: toolName,
            to: normalizedToolName,
          },
          'repaired tool call name casing',
        );

        return {
          ...failed.toolCall,
          toolName: normalizedToolName,
        };
      }

      return failed.toolCall;
    },
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

  const resolveResponseMessages = async (phase: 'finish' | 'unknown'): Promise<ModelMessage[]> => {
    try {
      return (await result.response).messages;
    } catch (error) {
      log.warn(
        {
          event: 'stream.response_messages.unavailable',
          sessionId,
          messageId,
          streamRunId: opts.streamRunId,
          providerId: opts.providerId,
          step,
          phase,
          error,
        },
        'step finished but provider response messages were unavailable',
      );
      return [];
    }
  };

  const hasStepSideEffects = (): boolean => {
    if (toolCalls.length > 0) {
      return true;
    }

    for (let i = initialPartCount; i < accumulatedParts.length; i++) {
      const part = accumulatedParts[i];
      if (part?.type === 'tool-call' || part?.type === 'tool-result') {
        return true;
      }
    }

    return false;
  };

  try {
    for await (const part of result.fullStream) {
      if (part.type === 'finish') {
        accumulator.flush();
        const permissionRejected = accumulator.getPermissionRejected();
        if (permissionRejected) throw permissionRejected;
        return {
          finishReason: part.finishReason,
          usage: part.totalUsage,
          toolCalls,
          responseMessages: await resolveResponseMessages('finish'),
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
    if (isStreamAbortedError(e) || isPermissionRejectedError(e)) {
      throw e;
    }

    if (hasStepSideEffects()) {
      const sideEffectPartTypes = accumulatedParts
        .slice(initialPartCount)
        .filter((part) => part?.type === 'tool-call' || part?.type === 'tool-result')
        .map((part) => part.type);

      log.warn(
        {
          event: 'stream.step.retry_suppressed_after_side_effects',
          sessionId,
          messageId,
          streamRunId: opts.streamRunId,
          providerId: opts.providerId,
          step,
          errorCode: getErrorCode(e),
          errorMessage: e instanceof Error ? e.message : String(e),
          sideEffectPartTypes,
          toolCallCount: toolCalls.length,
          responsePartCountDelta: accumulatedParts.length - initialPartCount,
        },
        'step failed after tool side effects; returning partial step result without retry',
      );

      return {
        finishReason: toolCalls.length > 0 ? 'tool-calls' : 'unknown',
        usage: Usage.ZERO_USAGE,
        toolCalls,
        responseMessages: await resolveResponseMessages('unknown'),
        protocolViolationCount: accumulator.getProtocolViolationCount(),
      };
    }

    throw e;
  }

  log.warn(
    {
      event: 'stream.step.execute.ended_without_finish',
      sessionId,
      messageId,
      streamRunId: opts.streamRunId,
      providerId: opts.providerId,
      step,
      toolCallCount: toolCalls.length,
      responsePartCountDelta: accumulatedParts.length - initialPartCount,
    },
    'step stream ended without finish event; returning unknown finish reason',
  );

  return {
    finishReason: 'unknown',
    usage: Usage.ZERO_USAGE,
    toolCalls,
    responseMessages: await resolveResponseMessages('unknown'),
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
          aiErrorName: errorInfo.aiErrorName,
          errorCategory: errorInfo.category,
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
          details: {
            category: errorInfo.category,
            isRetryable: errorInfo.isRetryable,
            aiErrorName: errorInfo.aiErrorName,
            statusCode: errorInfo.statusCode,
          },
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
