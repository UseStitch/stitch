import type { PrefixedString, StoredPart } from '@openwork/shared';

import { getDb } from '@/db/client.js';
import { messages } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import * as Sse from '@/lib/sse.js';
import { isOverflow, compact, getModelLimits } from '@/llm/compaction.js';
import { checkAndHandleDoomLoop, type ToolCallRecord } from '@/llm/doom-loop.js';
import { createProvider } from '@/provider/provider.js';
import type { ProviderCredentials } from '@/provider/provider.js';
import { createTools, MAX_STEPS, MAX_STEPS_WARNING } from '@/tools/index.js';
import * as Usage from '@/utils/usage.js';
import type { ModelMessage, LanguageModelUsage } from 'ai';

import { executeStepWithRetry } from '@/llm/step-executor.js';

const log = Log.create({ service: 'stream-runner' });

function isPermissionRejectedError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('User rejected tool execution for ');
}

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
  const { sessionId, assistantMessageId, modelId, agentId, llmMessages, credentials, abortSignal } = opts;

  const provider = createProvider(credentials);
  const model = provider(modelId);
  const tools = createTools({ sessionId, messageId: assistantMessageId });

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

  await Sse.broadcast('stream-start', { sessionId, messageId: assistantMessageId });

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
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
      });

      totalUsage = Usage.addUsage(totalUsage, stepResult.usage);
      finalFinishReason = stepResult.finishReason;

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
      log.info('proactive compaction triggered', {
        sessionId,
        totalTokens: totalUsage.totalTokens,
        inputTokens: totalUsage.inputTokens,
      });
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      wasAborted = true;
      finalFinishReason = 'aborted';
      log.info('stream aborted by user', { sessionId, messageId: assistantMessageId });

      // Mark any in-flight tool calls as aborted in the UI
      const toolCallIds = new Set(
        accumulatedParts
          .filter((p): p is StoredPart & { type: 'tool-result' } => p.type === 'tool-result')
          .map((p) => p.toolCallId),
      );
      for (const part of accumulatedParts) {
        if (part.type === 'tool-call' && !toolCallIds.has(part.toolCallId)) {
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
      const rejectionMessage = error instanceof Error ? error.message : String(error);
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
      log.info('stream stopped due to user-rejected tool', {
        sessionId,
        messageId: assistantMessageId,
        error: rejectionMessage,
      });
    } else if (error instanceof Error && error.message === 'context_overflow') {
      contextOverflow = true;
      needsCompaction = true;
      finalFinishReason = 'context-overflow';
      log.info('context overflow caught, triggering compaction', { sessionId });
    } else {
      finalFinishReason = 'error';
      streamError = error;
      await Sse.broadcast('stream-error', {
        sessionId,
        messageId: assistantMessageId,
        error: error instanceof Error ? error.message : String(error),
      });
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
      log.error('compaction failed', { sessionId });
    }
  }
}
