import { streamText, smoothStream } from 'ai';
import type { ModelMessage, LanguageModelUsage } from 'ai';
import type { PartId, PrefixedString, StoredPart } from '@openwork/shared';
import { createPartId } from '@openwork/shared';
import { getDb } from '../db/client.js';
import { messages } from '../db/schema.js';
import * as Log from './log.js';
import * as Sse from './sse.js';
import * as Usage from '../utils/usage.js';
import { createProvider } from '../provider/provider.js';
import type { ProviderCredentials } from '../provider/provider.js';
import { createTools, MAX_STEPS, MAX_STEPS_WARNING } from '../tools/index.js';
import { MAX_RETRIES, sleep, delay, extractErrorInfo, isRetryable } from './retry.js';
import {
  DOOM_LOOP_THRESHOLD,
  DOOM_LOOP_MESSAGE,
  isDoomLoop,
  waitForUserDecision,
  type ToolCallRecord,
} from '../llm/doom-loop.js';
import { stableStringify } from '../utils/stable-stringify.js';
import { isOverflow, compact, getModelLimits } from '../llm/compaction.js';

const log = Log.create({ service: 'stream-runner' });


type StepResult = {
  finishReason: string;
  usage: LanguageModelUsage;
  toolCalls: ToolCallRecord[];
  responseMessages: ModelMessage[];
};

async function runStep(opts: {
  sessionId: string;
  messageId: string;
  step: number;
  model: ReturnType<ReturnType<typeof createProvider>>;
  conversation: ModelMessage[];
  accumulatedParts: StoredPart[];
  tools: ReturnType<typeof createTools>;
}): Promise<StepResult> {
  const { sessionId, messageId, step, model, conversation, accumulatedParts, tools } = opts;

  const result = streamText({
    model,
    messages: conversation,
    tools,
    experimental_transform: smoothStream({
      delayInMs: 100,
    }),
    onError: ({ error }) => {
      log.error('step stream error', { sessionId, messageId, error });
    },
  });

  const toolCalls: ToolCallRecord[] = [];

  // In-memory accumulation for text and reasoning parts
  let currentTextPart: { id: PartId; text: string; startedAt: number } | null = null;
  let currentReasoningPart: { id: PartId; text: string; startedAt: number } | null = null;

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-start': {
        const partId = createPartId();
        currentTextPart = { id: partId, text: '', startedAt: Date.now() };
        await Sse.broadcast('stream-part-update', { sessionId, messageId, partId, part });
        break;
      }

      case 'text-delta': {
        if (currentTextPart) {
          currentTextPart.text += part.text;
          await Sse.broadcast('stream-part-delta', {
            sessionId,
            messageId,
            partId: currentTextPart.id,
            delta: part,
          });
        }
        break;
      }

      case 'text-end': {
        if (currentTextPart) {
          const now = Date.now();
          accumulatedParts.push({
            type: 'text-delta' as const,
            text: currentTextPart.text,
            id: currentTextPart.id,
            startedAt: currentTextPart.startedAt,
            endedAt: now,
          });
          await Sse.broadcast('stream-part-update', { sessionId, messageId, partId: currentTextPart.id, part });
          currentTextPart = null;
        }
        break;
      }

      case 'reasoning-start': {
        const partId = createPartId();
        currentReasoningPart = { id: partId, text: '', startedAt: Date.now() };
        await Sse.broadcast('stream-part-update', { sessionId, messageId, partId, part });
        break;
      }

      case 'reasoning-delta': {
        if (currentReasoningPart) {
          currentReasoningPart.text += part.text;
          await Sse.broadcast('stream-part-delta', {
            sessionId,
            messageId,
            partId: currentReasoningPart.id,
            delta: part,
          });
        }
        break;
      }

      case 'reasoning-end': {
        if (currentReasoningPart) {
          const now = Date.now();
          accumulatedParts.push({
            type: 'reasoning-delta' as const,
            text: currentReasoningPart.text,
            id: currentReasoningPart.id,
            startedAt: currentReasoningPart.startedAt,
            endedAt: now,
          });
          await Sse.broadcast('stream-part-update', { sessionId, messageId, partId: currentReasoningPart.id, part });
          currentReasoningPart = null;
        }
        break;
      }

      case 'source': {
        const now = Date.now();
        const partId = createPartId();
        accumulatedParts.push({ ...part, id: partId, startedAt: now, endedAt: now });
        await Sse.broadcast('stream-part-update', { sessionId, messageId, partId, part });
        break;
      }

      case 'file': {
        const partId = createPartId();
        const now = Date.now();
        accumulatedParts.push({ ...part, id: partId, startedAt: now, endedAt: now });
        await Sse.broadcast('stream-part-update', { sessionId, messageId, partId, part });
        break;
      }

      case 'tool-input-start': {
        await Sse.broadcast('stream-tool-state', {
          sessionId,
          messageId,
          toolCallId: part.id,
          toolName: part.toolName,
          status: 'pending',
        });
        break;
      }

      case 'tool-input-delta': {
        await Sse.broadcast('stream-tool-input-delta', {
          sessionId,
          messageId,
          toolCallId: part.id,
          toolName: '',
          inputTextDelta: part.delta,
        });
        break;
      }

      case 'tool-input-end':
        break;

      case 'tool-call': {
        const now = Date.now();
        const partId = createPartId();

        // Record for doom loop detection
        toolCalls.push({
          toolName: part.toolName,
          inputJson: stableStringify(part.input),
        });

        await Sse.broadcast('stream-tool-state', {
          sessionId,
          messageId,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: 'in-progress',
          input: part.input,
        });

        accumulatedParts.push({
          ...part,
          id: partId,
          toolCallId: part.toolCallId,
          startedAt: now,
          endedAt: now,
        } as StoredPart);
        break;
      }

      case 'tool-result': {
        const now = Date.now();
        const partId = createPartId();

        await Sse.broadcast('stream-tool-state', {
          sessionId,
          messageId,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: 'completed',
          input: part.input,
          output: part.output,
        });

        accumulatedParts.push({
          type: 'tool-result',
          id: partId,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
          output: part.output,
          truncated: false,
          startedAt: now,
          endedAt: now,
        } as StoredPart);
        break;
      }

      case 'tool-error': {
        await Sse.broadcast('stream-tool-state', {
          sessionId,
          messageId,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: 'error',
          error: String(part.error),
        });

        log.warn('tool call failed', {
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          error: String(part.error),
        });
        break;
      }

      case 'error': {
        log.error('stream part error', { sessionId, messageId, error: part.error });
        await Sse.broadcast('stream-error', { sessionId, messageId, error: String(part.error) });
        break;
      }

      case 'start-step': {
        const stepStartNow = Date.now();
        const partId = createPartId();
        accumulatedParts.push({
          type: 'step-start' as const,
          id: partId,
          step,
          startedAt: stepStartNow,
          endedAt: stepStartNow,
        });
        await Sse.broadcast('step-start', { sessionId, messageId, step });
        break;
      }

      case 'finish-step': {
        const stepFinishNow = Date.now();
        const partId = createPartId();
        accumulatedParts.push({
          type: 'step-finish' as const,
          id: partId,
          step,
          finishReason: part.finishReason,
          usage: part.usage,
          startedAt: stepFinishNow,
          endedAt: stepFinishNow,
        });
        await Sse.broadcast('step-finish', {
          sessionId,
          messageId,
          step,
          finishReason: part.finishReason,
          usage: part.usage,
        });
        break;
      }

      case 'start':
      case 'raw':
        break;

      case 'finish': {
        return {
          finishReason: part.finishReason,
          usage: part.totalUsage,
          toolCalls,
          responseMessages: (await result.response).messages,
        };
      }
    }
  }

  return {
    finishReason: 'unknown',
    usage: Usage.ZERO_USAGE,
    toolCalls,
    responseMessages: (await result.response).messages,
  };
}


async function runStepWithRetry(opts: {
  sessionId: string;
  messageId: string;
  step: number;
  model: ReturnType<ReturnType<typeof createProvider>>;
  conversation: ModelMessage[];
  accumulatedParts: StoredPart[];
  providerId: string;
  tools: ReturnType<typeof createTools>;
}): Promise<StepResult> {
  let attempt = 0;

  while (true) {
    try {
      return await runStep(opts);
    } catch (error) {
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

      await sleep(waitTime);
    }
  }
}




export async function runStream(opts: {
  sessionId: PrefixedString<'ses'>;
  assistantMessageId: PrefixedString<'msg'>;
  modelId: string;
  llmMessages: ModelMessage[];
  credentials: ProviderCredentials;
}): Promise<void> {
  const { sessionId, assistantMessageId, modelId, llmMessages, credentials } = opts;

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

      const stepResult = await runStepWithRetry({
        sessionId,
        messageId: assistantMessageId,
        step,
        model,
        conversation,
        accumulatedParts,
        providerId: credentials.providerId,
        tools,
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

      if (isDoomLoop(toolCallHistory)) {
        const repeatedTool = toolCallHistory[toolCallHistory.length - 1].toolName;

        log.warn('doom loop detected', {
          sessionId,
          messageId: assistantMessageId,
          toolName: repeatedTool,
          consecutiveCount: DOOM_LOOP_THRESHOLD,
        });

        await Sse.broadcast('doom-loop-detected', {
          sessionId,
          messageId: assistantMessageId,
          toolName: repeatedTool,
          consecutiveCount: DOOM_LOOP_THRESHOLD,
        });

        const decision = await waitForUserDecision(sessionId);

        if (decision === 'stop') {
          log.info('user stopped doom loop', { sessionId });

          conversation.push({
            role: 'system',
            content: DOOM_LOOP_MESSAGE,
          });

          const summaryResult = await runStepWithRetry({
            sessionId,
            messageId: assistantMessageId,
            step: step + 1,
            model,
            conversation,
            accumulatedParts,
            providerId: credentials.providerId,
            tools,
          });

          totalUsage = Usage.addUsage(totalUsage, summaryResult.usage);
          finalFinishReason = summaryResult.finishReason;
          for (const msg of summaryResult.responseMessages) {
            conversation.push(msg);
          }
          break;
        }

        // User chose 'continue' — proceed as normal
        log.info('user continued past doom loop', { sessionId });
      }
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
    if (error instanceof Error && error.message === 'context_overflow') {
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
    const finishedAt = Date.now();
    const db = getDb();
    await db.insert(messages).values({
      id: assistantMessageId,
      sessionId,
      role: 'assistant',
      parts: accumulatedParts,
      modelId,
      providerId: credentials.providerId,
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

  if (streamError) throw streamError;

  // ── Compaction ────────────────────────────────────────────────────────────
  if (needsCompaction) {
    const result = await compact({
      sessionId,
      providerId: credentials.providerId,
      modelId,
      auto: true,
      overflow: contextOverflow,
    });

    if (result === 'error') {
      log.error('compaction failed', { sessionId });
    }
  }
}
