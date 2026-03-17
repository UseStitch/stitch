import { randomUUID } from 'node:crypto';

import { createPartId } from '@openwork/shared';
import type { PrefixedString, StoredPart } from '@openwork/shared';

import { getDb } from '@/db/client.js';
import { messages } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import * as Sse from '@/lib/sse.js';
import {
  getErrorCode,
  getErrorMessage,
  isContextOverflowError,
  isPermissionRejectedError,
  isStreamAbortedError,
} from '@/lib/stream-errors.js';
import { isOverflow, compact, getModelLimits } from '@/llm/compaction.js';
import { checkAndHandleDoomLoop, type ToolCallRecord } from '@/llm/doom-loop.js';
import { executeStepWithRetry, type StepOptions } from '@/llm/step-executor.js';
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

const TRANSIENT_PART_TYPES = new Set([
  'text-delta',
  'text-start',
  'text-end',
  'reasoning-delta',
  'reasoning-start',
  'reasoning-end',
  'source',
  'file',
]);

type RunStreamOptions = {
  sessionId: PrefixedString<'ses'>;
  assistantMessageId: PrefixedString<'msg'>;
  modelId: string;
  agentId: string;
  llmMessages: ModelMessage[];
  credentials: ProviderCredentials;
  abortSignal: AbortSignal;
};

type StreamRunnerDeps = {
  executeStepWithRetry: typeof executeStepWithRetry;
  checkAndHandleDoomLoop: typeof checkAndHandleDoomLoop;
  getModelLimits: typeof getModelLimits;
  compact: typeof compact;
  saveAssistantMessage: typeof saveAssistantMessage;
  broadcast: typeof Sse.broadcast;
  now: () => number;
};

type StreamRunnerContext = {
  sessionId: PrefixedString<'ses'>;
  assistantMessageId: PrefixedString<'msg'>;
  modelId: string;
  providerId: string;
  agentId: PrefixedString<'agt'>;
  abortSignal: AbortSignal;
  streamRunId: string;
  startedAt: number;
  model: ReturnType<ReturnType<typeof createProvider>>;
  tools: ReturnType<typeof createTools>;
};

type StreamRunnerState = {
  accumulatedParts: StoredPart[];
  conversation: ModelMessage[];
  toolCallHistory: ToolCallRecord[];
  totalUsage: LanguageModelUsage;
  finalFinishReason: string;
  needsCompaction: boolean;
  contextOverflow: boolean;
  streamError: unknown;
  wasAborted: boolean;
  stepCount: number;
  protocolViolationCount: number;
};

const DEFAULT_DEPS: StreamRunnerDeps = {
  executeStepWithRetry,
  checkAndHandleDoomLoop,
  getModelLimits,
  compact,
  saveAssistantMessage,
  broadcast: Sse.broadcast,
  now: Date.now,
};

class StreamRunner {
  private readonly ctx: StreamRunnerContext;
  private readonly state: StreamRunnerState;
  private readonly deps: StreamRunnerDeps;

  constructor(opts: RunStreamOptions, deps: Partial<StreamRunnerDeps> = {}) {
    const provider = createProvider(opts.credentials);
    const model = provider(opts.modelId);
    const streamRunId = randomUUID();
    const agentId = opts.agentId as PrefixedString<'agt'>;
    const startedAt = Date.now();

    this.ctx = {
      sessionId: opts.sessionId,
      assistantMessageId: opts.assistantMessageId,
      modelId: opts.modelId,
      providerId: opts.credentials.providerId,
      agentId,
      abortSignal: opts.abortSignal,
      streamRunId,
      startedAt,
      model,
      tools: createTools({
        sessionId: opts.sessionId,
        messageId: opts.assistantMessageId,
        agentId,
        streamRunId,
      }),
    };

    this.state = {
      accumulatedParts: [],
      conversation: [...opts.llmMessages],
      toolCallHistory: [],
      totalUsage: Usage.ZERO_USAGE,
      finalFinishReason: 'unknown',
      needsCompaction: false,
      contextOverflow: false,
      streamError: undefined,
      wasAborted: false,
      stepCount: 0,
      protocolViolationCount: 0,
    };

    this.deps = { ...DEFAULT_DEPS, ...deps };
  }

  async run(): Promise<void> {
    this.logStart();
    await this.deps.broadcast('stream-start', {
      sessionId: this.ctx.sessionId,
      messageId: this.ctx.assistantMessageId,
    });

    try {
      await this.runStepLoop();
      await this.evaluateCompactionTrigger();
    } catch (error) {
      await this.handleError(error);
    } finally {
      await this.persistAndLogFinish();
    }

    if (this.state.streamError) {
      throw this.state.streamError;
    }

    if (this.state.wasAborted) {
      return;
    }

    await this.maybeRunCompaction();
  }

  private buildStepOptions(step: number): StepOptions {
    return {
      sessionId: this.ctx.sessionId,
      messageId: this.ctx.assistantMessageId,
      step,
      model: this.ctx.model,
      conversation: this.state.conversation,
      accumulatedParts: this.state.accumulatedParts,
      providerId: this.ctx.providerId,
      tools: this.ctx.tools,
      abortSignal: this.ctx.abortSignal,
      streamRunId: this.ctx.streamRunId,
    };
  }

  private logStart(): void {
    log.info(
      {
        event: 'stream.started',
        phase: 'start',
        streamRunId: this.ctx.streamRunId,
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        modelId: this.ctx.modelId,
        providerId: this.ctx.providerId,
        agentId: this.ctx.agentId,
      },
      'stream.started',
    );
  }

  private async runStepLoop(): Promise<void> {
    for (let step = 0; step < MAX_STEPS; step++) {
      this.state.stepCount = step + 1;
      log.info(
        {
          event: 'stream.step.started',
          phase: 'step',
          streamRunId: this.ctx.streamRunId,
          sessionId: this.ctx.sessionId,
          messageId: this.ctx.assistantMessageId,
          step,
        },
        'stream.step.started',
      );

      const isLastStep = step === MAX_STEPS - 1;
      if (isLastStep) {
        this.state.conversation.push({
          role: 'system',
          content: MAX_STEPS_WARNING(MAX_STEPS),
        });
      }

      const stepResult = await this.deps.executeStepWithRetry(this.buildStepOptions(step));
      this.state.totalUsage = Usage.addUsage(this.state.totalUsage, stepResult.usage);
      this.setFinishReason(stepResult.finishReason, 'step-finish');
      this.state.protocolViolationCount += stepResult.protocolViolationCount;

      log.info(
        {
          event: 'stream.step.finished',
          phase: 'step',
          streamRunId: this.ctx.streamRunId,
          sessionId: this.ctx.sessionId,
          messageId: this.ctx.assistantMessageId,
          step,
          finishReason: stepResult.finishReason,
          usage: stepResult.usage,
          toolCallCount: stepResult.toolCalls.length,
          protocolViolationCount: this.state.protocolViolationCount,
        },
        'stream.step.finished',
      );

      for (const msg of stepResult.responseMessages) {
        this.state.conversation.push(msg);
      }

      if (stepResult.finishReason !== 'tool-calls' || stepResult.toolCalls.length === 0) {
        break;
      }

      for (const call of stepResult.toolCalls) {
        this.state.toolCallHistory.push(call);
      }

      const doomLoopState = await this.deps.checkAndHandleDoomLoop({
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        toolCallHistory: this.state.toolCallHistory,
        conversation: this.state.conversation,
        stepOptions: this.buildStepOptions(step + 1),
        currentState: {
          totalUsage: this.state.totalUsage,
          finalFinishReason: this.state.finalFinishReason,
          isStopped: false,
        },
      });

      this.state.totalUsage = doomLoopState.totalUsage;
      this.setFinishReason(doomLoopState.finalFinishReason, 'doom-loop');
      if (doomLoopState.isStopped) {
        break;
      }
    }
  }

  private async evaluateCompactionTrigger(): Promise<void> {
    const limits = await this.deps.getModelLimits(this.ctx.providerId, this.ctx.modelId);
    if (!isOverflow(this.state.totalUsage, limits)) {
      return;
    }

    this.setNeedsCompaction(true, 'token-overflow');
    log.info(
      {
        event: 'stream.compaction.triggered',
        phase: 'compaction',
        streamRunId: this.ctx.streamRunId,
        sessionId: this.ctx.sessionId,
        totalTokens: this.state.totalUsage.totalTokens,
        inputTokens: this.state.totalUsage.inputTokens,
      },
      'stream.compaction.triggered',
    );
  }

  private async handleError(error: unknown): Promise<void> {
    if (isStreamAbortedError(error)) {
      await this.handleAbort(error);
      return;
    }

    if (isPermissionRejectedError(error)) {
      this.handlePermissionRejected(error);
      return;
    }

    if (isContextOverflowError(error)) {
      this.handleContextOverflow();
      return;
    }

    await this.handleUnknownError(error);
  }

  private async handleAbort(error: unknown): Promise<void> {
    this.state.wasAborted = true;
    this.setFinishReason('aborted', 'abort-signal');

    log.info(
      {
        event: 'stream.abort.handled',
        phase: 'error',
        streamRunId: this.ctx.streamRunId,
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        errorCode: getErrorCode(error),
      },
      'stream.abort.handled',
    );

    const toolCallIds = new Set(
      this.state.accumulatedParts
        .filter((p): p is StoredPart & { type: 'tool-result' } => p.type === 'tool-result')
        .map((p) => p.toolCallId),
    );

    for (const part of this.state.accumulatedParts) {
      if (part.type !== 'tool-call' || toolCallIds.has(part.toolCallId)) {
        continue;
      }

      const now = this.deps.now();
      this.state.accumulatedParts.push({
        type: 'tool-result',
        id: createPartId(),
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        output: { error: 'Aborted' },
        truncated: false,
        startedAt: now,
        endedAt: now,
      } as StoredPart);

      await this.deps.broadcast('stream-tool-state', {
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        status: 'error',
        error: 'Aborted',
      });
    }
  }

  private handlePermissionRejected(error: unknown): void {
    const rejectionMessage = getErrorMessage(error);
    this.setFinishReason('blocked', 'permission-rejected');

    for (let i = this.state.accumulatedParts.length - 1; i >= 0; i--) {
      const type = this.state.accumulatedParts[i]?.type;
      if (type && TRANSIENT_PART_TYPES.has(type)) {
        this.state.accumulatedParts.splice(i, 1);
      }
    }

    log.info(
      {
        event: 'stream.permission.rejected',
        phase: 'error',
        streamRunId: this.ctx.streamRunId,
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        error: rejectionMessage,
        errorCode: getErrorCode(error),
      },
      'stream.permission.rejected',
    );
  }

  private handleContextOverflow(): void {
    this.state.contextOverflow = true;
    this.setNeedsCompaction(true, 'context-overflow');
    this.setFinishReason('context-overflow', 'context-overflow');

    log.info(
      {
        event: 'stream.context_overflow',
        phase: 'error',
        streamRunId: this.ctx.streamRunId,
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
      },
      'stream.context_overflow',
    );
  }

  private async handleUnknownError(error: unknown): Promise<void> {
    this.setFinishReason('error', 'unhandled-error');
    this.state.streamError = error;

    await this.deps.broadcast('stream-error', {
      sessionId: this.ctx.sessionId,
      messageId: this.ctx.assistantMessageId,
      error: getErrorMessage(error),
    });

    log.error(
      {
        event: 'stream.failed',
        phase: 'error',
        streamRunId: this.ctx.streamRunId,
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        errorCode: getErrorCode(error),
        error,
      },
      'stream.failed',
    );
  }

  private async persistAndLogFinish(): Promise<void> {
    await this.deps.saveAssistantMessage({
      sessionId: this.ctx.sessionId,
      assistantMessageId: this.ctx.assistantMessageId,
      modelId: this.ctx.modelId,
      providerId: this.ctx.providerId,
      agentId: this.ctx.agentId,
      accumulatedParts: this.state.accumulatedParts,
      totalUsage: this.state.totalUsage,
      finalFinishReason: this.state.finalFinishReason,
      startedAt: this.ctx.startedAt,
    });

    const toolCallCount = this.state.accumulatedParts.filter((p) => p.type === 'tool-call').length;
    const toolErrorCount = this.state.accumulatedParts.filter(
      (p) =>
        p.type === 'tool-result' &&
        p.output !== null &&
        p.output !== undefined &&
        typeof p.output === 'object' &&
        'error' in (p.output as object),
    ).length;

    log.info(
      {
        event: 'stream.finished',
        phase: 'finalize',
        streamRunId: this.ctx.streamRunId,
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        finishReason: this.state.finalFinishReason,
        durationMs: this.deps.now() - this.ctx.startedAt,
        stepCount: this.state.stepCount,
        partCount: this.state.accumulatedParts.length,
        toolCallCount,
        toolErrorCount,
        protocolViolationCount: this.state.protocolViolationCount,
        needsCompaction: this.state.needsCompaction,
        contextOverflow: this.state.contextOverflow,
      },
      'stream.finished',
    );
  }

  private async maybeRunCompaction(): Promise<void> {
    if (!this.state.needsCompaction) {
      return;
    }

    const result = await this.deps.compact({
      sessionId: this.ctx.sessionId,
      providerId: this.ctx.providerId,
      modelId: this.ctx.modelId,
      agentId: this.ctx.agentId,
      auto: true,
      overflow: this.state.contextOverflow,
    });

    if (result === 'error') {
      log.error(
        {
          event: 'stream.compaction.failed',
          phase: 'compaction',
          streamRunId: this.ctx.streamRunId,
          sessionId: this.ctx.sessionId,
          messageId: this.ctx.assistantMessageId,
        },
        'compaction failed',
      );
    }
  }

  private setFinishReason(next: string, reason: string): void {
    const current = this.state.finalFinishReason;
    if (current === next) {
      return;
    }

    log.info(
      {
        event: 'stream.state.transition',
        phase: 'state',
        streamRunId: this.ctx.streamRunId,
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        field: 'finalFinishReason',
        from: current,
        to: next,
        reason,
      },
      'stream.state.transition',
    );
    this.state.finalFinishReason = next;
  }

  private setNeedsCompaction(next: boolean, reason: string): void {
    const current = this.state.needsCompaction;
    if (current === next) {
      return;
    }

    log.info(
      {
        event: 'stream.state.transition',
        phase: 'state',
        streamRunId: this.ctx.streamRunId,
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        field: 'needsCompaction',
        from: current,
        to: next,
        reason,
      },
      'stream.state.transition',
    );
    this.state.needsCompaction = next;
  }
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
  const runner = new StreamRunner(opts);
  await runner.run();
}
