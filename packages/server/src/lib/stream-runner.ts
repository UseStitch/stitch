import { streamText, smoothStream } from 'ai';
import type { ModelMessage, LanguageModelUsage, ToolResultPart } from 'ai';
import type { PrefixedString, StoredPart } from '@openwork/shared';
import { createPartId } from '@openwork/shared';
import { getDb } from '../db/client.js';
import { messages } from '../db/schema.js';
import * as Log from './log.js';
import * as Sse from './sse.js';
import * as Usage from '../utils/usage.js';
import { createProvider } from '../provider/provider.js';
import type { ProviderCredentials } from '../provider/provider.js';
import { TOOL_DEFINITIONS, TOOL_EXECUTORS } from '../tools/index.js';
import { MAX_RETRIES, sleep, delay, extractErrorInfo, isRetryable } from './retry.js';

const log = Log.create({ service: 'stream-runner' });

const MAX_STEPS = 25;
const MAX_TOOL_RETRIES = 3;

// ─── Single LLM step ─────────────────────────────────────────────────────────

type StepResult = {
  finishReason: string;
  usage: LanguageModelUsage;
  toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>;
  responseMessages: ModelMessage[];
};

async function runStep(opts: {
  sessionId: string;
  messageId: string;
  step: number;
  model: ReturnType<ReturnType<typeof createProvider>>;
  conversation: ModelMessage[];
  accumulatedParts: StoredPart[];
  partStartTimes: Map<string, number>;
}): Promise<StepResult> {
  const { sessionId, messageId, step, model, conversation, accumulatedParts, partStartTimes } =
    opts;

  const result = streamText({
    model,
    messages: conversation,
    tools: TOOL_DEFINITIONS,
    experimental_transform: smoothStream(),
    onError: ({ error }) => {
      log.error('step stream error', { sessionId, messageId, error });
    },
  });

  const toolCalls: StepResult['toolCalls'] = [];

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-start': {
        partStartTimes.set(part.id, Date.now());
        await Sse.broadcast('stream-part-update', { sessionId, messageId, partId: part.id, part });
        break;
      }

      case 'text-delta': {
        const now = Date.now();
        const partId = createPartId();
        accumulatedParts.push({
          ...part,
          id: partId,
          startedAt: partStartTimes.get(part.id) ?? now,
          endedAt: now,
        });
        await Sse.broadcast('stream-part-delta', {
          sessionId,
          messageId,
          partId,
          delta: part,
        });
        break;
      }

      case 'text-end': {
        await Sse.broadcast('stream-part-update', { sessionId, messageId, partId: part.id, part });
        break;
      }

      case 'reasoning-start': {
        partStartTimes.set(part.id, Date.now());
        await Sse.broadcast('stream-part-update', { sessionId, messageId, partId: part.id, part });
        break;
      }

      case 'reasoning-delta': {
        const now = Date.now();
        const partId = createPartId();
        accumulatedParts.push({
          ...part,
          id: partId,
          startedAt: partStartTimes.get(part.id) ?? now,
          endedAt: now,
        });
        await Sse.broadcast('stream-part-delta', {
          sessionId,
          messageId,
          partId,
          delta: part,
        });
        break;
      }

      case 'reasoning-end': {
        await Sse.broadcast('stream-part-update', { sessionId, messageId, partId: part.id, part });
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

      // ── Tool input streaming: fires while the LLM generates args ───────────
      // part.id is the toolCallId for tool-input-* events in fullStream.

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
          // tool-input-delta only carries id + delta; toolName resolved on FE from pending state
          toolCallId: part.id,
          toolName: '',
          inputTextDelta: part.delta,
        });
        break;
      }

      case 'tool-input-end':
        // tool-call fires immediately after with fully-parsed input — no-op
        break;

      // ── tool-call: LLM finished generating args; we take over ─────────────
      case 'tool-call': {
        const now = Date.now();
        const partId = createPartId();
        accumulatedParts.push({ ...part, id: partId, startedAt: now, endedAt: now });
        toolCalls.push({ toolCallId: part.toolCallId, toolName: part.toolName, input: part.input });
        break;
      }

      // tool-result and tool-error won't fire (no execute on tools), guard anyway
      case 'tool-result':
      case 'tool-error':
        break;

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

// ─── Step execution with retry ──────────────────────────────────────────────

async function runStepWithRetry(opts: {
  sessionId: string;
  messageId: string;
  step: number;
  model: ReturnType<ReturnType<typeof createProvider>>;
  conversation: ModelMessage[];
  accumulatedParts: StoredPart[];
  partStartTimes: Map<string, number>;
  providerId: string;
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
        await Sse.broadcast('stream-error', {
          sessionId: opts.sessionId,
          messageId: opts.messageId,
          error: `Context overflow: ${errorInfo.message}`,
        });
        throw error;
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

// ─── Tool execution with Zod validation ──────────────────────────────────────

type ExecuteResult = { ok: true; output: unknown } | { ok: false; error: string };

async function executeTool(toolName: string, input: unknown): Promise<ExecuteResult> {
  const executor = TOOL_EXECUTORS[toolName];
  if (!executor) return { ok: false, error: `Unknown tool: ${toolName}` };

  const parsed = executor.inputSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    return { ok: false, error: `Invalid arguments for "${toolName}":\n${issues}` };
  }

  try {
    const output = await executor.execute(parsed.data);
    return { ok: true, output };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runStream(opts: {
  sessionId: PrefixedString<'ses'>;
  assistantMessageId: PrefixedString<'msg'>;
  modelId: string;
  modelLabel: string;
  llmMessages: ModelMessage[];
  credentials: ProviderCredentials;
}): Promise<void> {
  const { sessionId, assistantMessageId, modelId, modelLabel, llmMessages, credentials } = opts;

  const provider = createProvider(credentials);
  const model = provider(modelId);

  const accumulatedParts: StoredPart[] = [];
  const partStartTimes = new Map<string, number>();
  const conversation: ModelMessage[] = [...llmMessages];
  const toolRetries = new Map<string, number>();

  let totalUsage: LanguageModelUsage = Usage.ZERO_USAGE;
  let finalFinishReason = 'unknown';
  const startedAt = Date.now();

  await Sse.broadcast('stream-start', { sessionId, messageId: assistantMessageId });

  const MAX_STEPS_WARNING = `CRITICAL: You are on step ${MAX_STEPS} (final step). Tools will be disabled after this. Complete all remaining work and provide your final answer.`;

  for (let step = 0; step < MAX_STEPS; step++) {
    const isLastStep = step === MAX_STEPS - 1;
    if (isLastStep) {
      conversation.unshift({
        role: 'system',
        content: MAX_STEPS_WARNING,
      });
    }

    const stepResult = await runStepWithRetry({
      sessionId,
      messageId: assistantMessageId,
      step,
      model,
      conversation,
      accumulatedParts,
      partStartTimes,
      providerId: credentials.providerId,
    });

    totalUsage = Usage.addUsage(totalUsage, stepResult.usage);
    finalFinishReason = stepResult.finishReason;

    for (const msg of stepResult.responseMessages) {
      conversation.push(msg);
    }

    if (stepResult.finishReason !== 'tool-calls' || stepResult.toolCalls.length === 0) break;

    // ── Execute each tool call and collect results ────────────────────────────
    const toolResultContent: ToolResultPart[] = [];

    for (const call of stepResult.toolCalls) {
      const { toolCallId, toolName, input } = call;

      await Sse.broadcast('stream-tool-state', {
        sessionId,
        messageId: assistantMessageId,
        toolCallId,
        toolName,
        status: 'in-progress',
        input,
      });

      const execResult = await executeTool(toolName, input);

      if (!execResult.ok) {
        const retries = (toolRetries.get(toolCallId) ?? 0) + 1;
        toolRetries.set(toolCallId, retries);

        await Sse.broadcast('stream-tool-state', {
          sessionId,
          messageId: assistantMessageId,
          toolCallId,
          toolName,
          status: 'error',
          input,
          error: execResult.error,
        });

        log.warn('tool call failed', { toolCallId, toolName, error: execResult.error, retries });

        const errorValue =
          retries >= MAX_TOOL_RETRIES
            ? { error: `Tool "${toolName}" failed after ${retries} attempts: ${execResult.error}` }
            : { error: execResult.error, hint: 'Fix the arguments and try again.' };

        toolResultContent.push({
          type: 'tool-result',
          toolCallId,
          toolName,
          output: { type: 'json', value: errorValue },
        });

        const now = Date.now();
        const partId = createPartId();
        accumulatedParts.push({
          type: 'tool-result',
          id: partId,
          toolCallId,
          toolName,
          input,
          output: errorValue,
          startedAt: now,
          endedAt: now,
        } as StoredPart);
      } else {
        await Sse.broadcast('stream-tool-state', {
          sessionId,
          messageId: assistantMessageId,
          toolCallId,
          toolName,
          status: 'completed',
          input,
          output: execResult.output,
        });

        toolResultContent.push({
          type: 'tool-result',
          toolCallId,
          toolName,
          output: { type: 'json', value: execResult.output as never },
        });

        const now = Date.now();
        const partId = createPartId();
        accumulatedParts.push({
          type: 'tool-result',
          id: partId,
          toolCallId,
          toolName,
          input,
          output: execResult.output,
          startedAt: now,
          endedAt: now,
        } as StoredPart);
      }
    }

    conversation.push({ role: 'tool', content: toolResultContent });
  }

  // ── Persist the full assistant message ────────────────────────────────────
  const finishedAt = Date.now();
  const db = getDb();
  await db.insert(messages).values({
    id: assistantMessageId,
    sessionId,
    role: 'assistant',
    parts: accumulatedParts,
    model: modelLabel,
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
