import { createPartId } from '@openwork/shared';
import type { PrefixedString, StoredPart } from '@openwork/shared';
import { randomUUID } from 'node:crypto';

import { getDb } from '@/db/client.js';
import { messages } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import * as Sse from '@/lib/sse.js';
import { isOverflow, compact, getModelLimits } from '@/llm/compaction.js';
import { checkAndHandleDoomLoop, type ToolCallRecord } from '@/llm/doom-loop.js';
import { executeStepWithRetry } from '@/llm/step-executor.js';
import {
  getErrorCode,
  getErrorMessage,
  isContextOverflowError,
  isPermissionRejectedError,
  isStreamAbortedError,
} from '@/lib/stream-errors.js';
import { createProvider } from '@/provider/provider.js';
import type { ProviderCredentials } from '@/provider/provider.js';
import { createTools, MAX_STEPS, MAX_STEPS_WARNING } from '@/tools/index.js';
import * as Usage from '@/utils/usage.js';
import type { ModelMessage, LanguageModelUsage } from 'ai';

const log = Log.create({ service: 'stream-runner' });

async function saveAssistantMessage(opts: {
  sessionId: string;
  assistantMessageId: PrefixedString<'msg'>;
  modelId: string;
  providerId: string;
  agentId: PrefixedString<'agt'>;
  accumulatedParts: StoredPart[];
  totalUsage: LanguageModelUsage;
  finalFinishReason: string;
  startedAt: number;
}) {
  const {
    sessionId,
    assistantMessageId,
    modelId,
    providerId,
    agentId,
    accumulatedParts,
    totalUsage,
    finalFinishReason,
    startedAt,
  } = opts;

  const finishedAt = Date.now();
  const db = getDb();
  await db.insert(messages).values({
    id: assistantMessageId,
    sessionId,
    role: 'assistant',
    parts: accumulatedParts,
    modelId,
    providerId,
    agentId: agentId as PrefixedString<'agt'>,
    usage: totalUsage,
    finishReason: finalFinishReason,
    createdAt: new Date(startedAt),
    startedAt: new Date(startedAt),
    duration: finishedAt - startedAt,
  });

  await Sse.broadcast('stream-finish', {
    sessionId,
    messageId: assistantMessageId,
    finishReason: finalFinishReason,
    usage: totalUsage,
  });
}

export async function runStream(opts: {
  sessionId: PrefixedString<'ses'>;
  assistantMessageId: PrefixedString<'msg'>;
  modelId: string;
  agentId: string;
  llmMessages: ModelMessage[];
  credentials: ProviderCredentials;
  abortSignal: AbortSignal;
}): Promise<void> {
  const { sessionId, assistantMessageId, modelId, agentId, llmMessages, credentials, abortSignal } =
    opts;

  const provider = createProvider(credentials);
  const model = provider(modelId);
  const streamRunId = randomUUID();
  const tools = createTools({
    sessionId,
    messageId: assistantMessageId,
    agentId: agentId as PrefixedString<'agt'>,
    streamRunId,
  });

  const accumulatedParts: StoredPart[] = [];
  const conversation: ModelMessage[] = [...llmMessages];
  const toolCallHistory: ToolCallRecord[] = [];

  let totalUsage: LanguageModelUsage = Usage.ZERO_USAGE;
  let finalFinishReason = 'unknown';
  let needsCompaction = false;
  let contextOverflow = false;
  let streamError: unknown = undefined;
  let wasAborted = false;
  const startedAt = Date.now();
  let stepCount = 0;
  let protocolViolationCount = 0;

  log.info({
    event: 'stream.started',
    streamRunId,
    sessionId,
    messageId: assistantMessageId,
    modelId,
    providerId: credentials.providerId,
    agentId,
  }, 'stream.started');

  await Sse.broadcast('stream-start', { sessionId, messageId: assistantMessageId });

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      stepCount = step + 1;
      log.info({
        event: 'stream.step.started',
        streamRunId,
        sessionId,
        messageId: assistantMessageId,
        step,
      }, 'stream.step.started');

      const isLastStep = step === MAX_STEPS - 1;
      if (isLastStep) {
        conversation.push({
          role: 'system',
          content: MAX_STEPS_WARNING(MAX_STEPS),
        });
      }

      const stepResult = await executeStepWithRetry({
        sessionId,
        messageId: assistantMessageId,
        step,
        model,
        conversation,
        accumulatedParts,
        providerId: credentials.providerId,
        tools,
        abortSignal,
        streamRunId,
      });

      totalUsage = Usage.addUsage(totalUsage, stepResult.usage);
      finalFinishReason = stepResult.finishReason;

      protocolViolationCount += stepResult.protocolViolationCount;

      log.info({
        event: 'stream.step.finished',
        streamRunId,
        sessionId,
        messageId: assistantMessageId,
        step,
        finishReason: stepResult.finishReason,
        usage: stepResult.usage,
        toolCallCount: stepResult.toolCalls.length,
      }, 'stream.step.finished');

      // Push SDK response messages into conversation for next step
      for (const msg of stepResult.responseMessages) {
        conversation.push(msg);
      }

      // If the model didn't call any tools, we're done
      if (stepResult.finishReason !== 'tool-calls' || stepResult.toolCalls.length === 0) break;

      // ── Doom loop detection ──────────────────────────────────────────────────
      for (const call of stepResult.toolCalls) {
        toolCallHistory.push(call);
      }

      const doomLoopState = await checkAndHandleDoomLoop({
        sessionId,
        messageId: assistantMessageId,
        toolCallHistory,
        conversation,
        stepOptions: {
          sessionId,
          messageId: assistantMessageId,
          step: step + 1,
          model,
          conversation,
          accumulatedParts,
          providerId: credentials.providerId,
          tools,
          abortSignal,
          streamRunId,
        },
        currentState: {
          totalUsage,
          finalFinishReason,
          isStopped: false,
        },
      });

      totalUsage = doomLoopState.totalUsage;
      finalFinishReason = doomLoopState.finalFinishReason;

      if (doomLoopState.isStopped) break;
    }

    // ── Proactive compaction check ───────────────────────────────────────────
    const limits = await getModelLimits(credentials.providerId, modelId);
    if (isOverflow(totalUsage, limits)) {
      needsCompaction = true;
      log.info({
        event: 'stream.compaction.triggered',
        streamRunId,
        sessionId,
        totalTokens: totalUsage.totalTokens,
        inputTokens: totalUsage.inputTokens,
      }, 'stream.compaction.triggered');
    }
  } catch (error) {
    if (isStreamAbortedError(error)) {
      wasAborted = true;
      finalFinishReason = 'aborted';
      log.info({
        event: 'stream.abort.handled',
        streamRunId,
        sessionId,
        messageId: assistantMessageId,
        errorCode: getErrorCode(error),
      }, 'stream.abort.handled');

      // Mark any in-flight tool calls as aborted in the UI
      const toolCallIds = new Set(
        accumulatedParts
          .filter((p): p is StoredPart & { type: 'tool-result' } => p.type === 'tool-result')
          .map((p) => p.toolCallId),
      );
      for (const part of accumulatedParts) {
        if (part.type === 'tool-call' && !toolCallIds.has(part.toolCallId)) {
          const now = Date.now();

          accumulatedParts.push({
            type: 'tool-result',
            id: createPartId(),
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: { error: 'Aborted' },
            truncated: false,
            startedAt: now,
            endedAt: now,
          } as StoredPart);

          await Sse.broadcast('stream-tool-state', {
            sessionId,
            messageId: assistantMessageId,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            status: 'error',
            error: 'Aborted',
          });
        }
      }
    } else if (isPermissionRejectedError(error)) {
      const rejectionMessage = getErrorMessage(error);
      finalFinishReason = 'blocked';
      for (let i = accumulatedParts.length - 1; i >= 0; i--) {
        const type = accumulatedParts[i]?.type;
        if (
          type === 'text-delta' ||
          type === 'text-start' ||
          type === 'text-end' ||
          type === 'reasoning-delta' ||
          type === 'reasoning-start' ||
          type === 'reasoning-end' ||
          type === 'source' ||
          type === 'file'
        ) {
          accumulatedParts.splice(i, 1);
        }
      }
      log.info({
        event: 'stream.permission.rejected',
        streamRunId,
        sessionId,
        messageId: assistantMessageId,
        error: rejectionMessage,
        errorCode: getErrorCode(error),
      }, 'stream.permission.rejected');
    } else if (isContextOverflowError(error)) {
      contextOverflow = true;
      needsCompaction = true;
      finalFinishReason = 'context-overflow';
      log.info({
        event: 'stream.context_overflow',
        streamRunId,
        sessionId,
        messageId: assistantMessageId,
      }, 'stream.context_overflow');
    } else {
      finalFinishReason = 'error';
      streamError = error;
      await Sse.broadcast('stream-error', {
        sessionId,
        messageId: assistantMessageId,
        error: getErrorMessage(error),
      });
      log.error({
        event: 'stream.failed',
        streamRunId,
        sessionId,
        messageId: assistantMessageId,
        errorCode: getErrorCode(error),
        error,
      }, 'stream.failed');
    }
  } finally {
    // ── Persist the full assistant message ──────────────────────────────────
    await saveAssistantMessage({
      sessionId,
      assistantMessageId,
      modelId,
      providerId: credentials.providerId,
      agentId: agentId as PrefixedString<'agt'>,
      accumulatedParts,
      totalUsage,
      finalFinishReason,
      startedAt,
    });

    const toolCallCount = accumulatedParts.filter((p) => p.type === 'tool-call').length;
    const toolErrorCount = accumulatedParts.filter(
      (p) =>
        p.type === 'tool-result' &&
        p.output !== null &&
        p.output !== undefined &&
        typeof p.output === 'object' &&
        'error' in (p.output as object),
    ).length;

    log.info({
      event: 'stream.finished',
      streamRunId,
      sessionId,
      messageId: assistantMessageId,
      finishReason: finalFinishReason,
      durationMs: Date.now() - startedAt,
      stepCount,
      partCount: accumulatedParts.length,
      toolCallCount,
      toolErrorCount,
      protocolViolationCount,
    }, 'stream.finished');
  }

  if (streamError) throw streamError;

  // Skip compaction if the stream was aborted — user interrupted, don't start new long-running work
  if (wasAborted) return;

  // ── Compaction ────────────────────────────────────────────────────────────
  if (needsCompaction) {
    const result = await compact({
      sessionId,
      providerId: credentials.providerId,
      modelId,
      agentId: agentId as PrefixedString<'agt'>,
      auto: true,
      overflow: contextOverflow,
    });

    if (result === 'error') {
      log.error({
        event: 'stream.compaction.failed',
        streamRunId,
        sessionId,
        messageId: assistantMessageId,
      }, 'compaction failed');
    }
  }
}
