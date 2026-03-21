import { randomUUID } from 'node:crypto';

import type { StoredPart } from '@stitch/shared/chat/messages';
import { createPartId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { getDisabledToolNames } from '@/agents/tool-config.js';
import { markSessionUnread } from '@/chat/service.js';
import { getDb } from '@/db/client.js';
import { messages } from '@/db/schema.js';
import { mapAIError, toStreamErrorDetails } from '@/lib/ai-error-mapper.js';
import * as Log from '@/lib/log.js';
import * as Sse from '@/lib/sse.js';
import {
  getErrorCode,
  getErrorMessage,
  isContextOverflowError,
  isPermissionRejectedError,
  isStreamAbortedError,
} from '@/lib/stream-errors.js';
import { transformAttachmentsForModel } from '@/llm/attachment-transform.js';
import { isOverflow, compact, getCompactionSettings, getModelLimits } from '@/llm/compaction.js';
import { checkAndHandleDoomLoop, type ToolCallRecord } from '@/llm/doom-loop.js';
import { executeStepWithRetry, type StepOptions } from '@/llm/step-executor.js';
import { createMcpToolsForAgent } from '@/mcp/tool-executor.js';
import { createProvider } from '@/provider/provider.js';
import type { ProviderCredentials } from '@/provider/provider.js';
import { createTools, MAX_STEPS, MAX_STEPS_WARNING } from '@/tools/index.js';
import { calculateMessageCostUsd } from '@/utils/cost.js';
import * as Usage from '@/utils/usage.js';
import type { ModelMessage, LanguageModelUsage } from 'ai';

const log = Log.create({ service: 'stream-runner' });

async function saveAssistantMessage(opts: {
  sessionId: PrefixedString<'ses'>;
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
  const costUsd = await calculateMessageCostUsd({
    providerId,
    modelId,
    usage: totalUsage,
  });

  await db.insert(messages).values({
    id: assistantMessageId,
    sessionId,
    role: 'assistant',
    parts: accumulatedParts,
    modelId,
    providerId,
    agentId: agentId as PrefixedString<'agt'>,
    usage: totalUsage,
    costUsd,
    finishReason: finalFinishReason,
    createdAt: startedAt,
    startedAt,
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
  agentId: PrefixedString<'agt'>;
  llmMessages: ModelMessage[];
  credentials: ProviderCredentials;
  abortSignal: AbortSignal;
  tools: ReturnType<typeof createTools>;
  streamRunId: string;
};

type StreamRunnerDeps = {
  executeStepWithRetry: typeof executeStepWithRetry;
  checkAndHandleDoomLoop: typeof checkAndHandleDoomLoop;
  getModelLimits: typeof getModelLimits;
  getCompactionSettings: typeof getCompactionSettings;
  compact: typeof compact;
  saveAssistantMessage: typeof saveAssistantMessage;
  markSessionUnread: typeof markSessionUnread;
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
  finalSynthesisAttempted: boolean;
  unknownRecoveryAttempts: number;
  toolCallFinishRecoveryAttempts: number;
  lastStepFinishReason: string;
  lastStepToolCallCount: number;
  lastStepResponseMessageCount: number;
};

const UNKNOWN_RECOVERY_LIMIT = 1;
const TOOL_CALL_FINISH_RECOVERY_LIMIT = 1;

const DEFAULT_DEPS: StreamRunnerDeps = {
  executeStepWithRetry,
  checkAndHandleDoomLoop,
  getModelLimits,
  getCompactionSettings,
  compact,
  saveAssistantMessage,
  markSessionUnread,
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
    const streamRunId = opts.streamRunId;
    const agentId = opts.agentId;
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
      tools: opts.tools,
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
      finalSynthesisAttempted: false,
      unknownRecoveryAttempts: 0,
      toolCallFinishRecoveryAttempts: 0,
      lastStepFinishReason: 'unknown',
      lastStepToolCallCount: 0,
      lastStepResponseMessageCount: 0,
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
      await this.maybeRunFinalSynthesis();
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
    const userPromptPreview = this.getLastUserPromptPreview();

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
        userPromptPreview,
      },
      'stream.started',
    );
  }

  private getLastUserPromptPreview(): string | null {
    for (let i = this.state.conversation.length - 1; i >= 0; i--) {
      const message = this.state.conversation[i];
      if (message?.role !== 'user') {
        continue;
      }

      const { content } = message;
      if (typeof content === 'string') {
        return content.slice(0, 200);
      }

      if (Array.isArray(content)) {
        const textPart = content.find(
          (part) => typeof part === 'object' && part !== null && part.type === 'text',
        );
        if (textPart && typeof textPart.text === 'string') {
          return textPart.text.slice(0, 200);
        }
      }
    }

    return null;
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

      const stepResult = await this.deps.executeStepWithRetry({
        ...this.buildStepOptions(step),
        tools: isLastStep ? ({} as StepOptions['tools']) : this.ctx.tools,
      });
      this.state.totalUsage = Usage.addUsage(this.state.totalUsage, stepResult.usage);
      this.setFinishReason(stepResult.finishReason, 'step-finish');
      this.state.protocolViolationCount += stepResult.protocolViolationCount;
      this.state.lastStepFinishReason = stepResult.finishReason;
      this.state.lastStepToolCallCount = stepResult.toolCalls.length;
      this.state.lastStepResponseMessageCount = stepResult.responseMessages.length;

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

      if (stepResult.toolCalls.length === 0) {
        if (
          stepResult.finishReason === 'tool-calls' &&
          this.state.toolCallFinishRecoveryAttempts < TOOL_CALL_FINISH_RECOVERY_LIMIT
        ) {
          this.state.toolCallFinishRecoveryAttempts += 1;
          log.warn(
            {
              event: 'stream.tool_calls_finish_without_tool_records.recovering',
              phase: 'step',
              streamRunId: this.ctx.streamRunId,
              sessionId: this.ctx.sessionId,
              messageId: this.ctx.assistantMessageId,
              step,
              attempt: this.state.toolCallFinishRecoveryAttempts,
              maxAttempts: TOOL_CALL_FINISH_RECOVERY_LIMIT,
            },
            'retrying step because finish reason indicated tool calls but no tool call records were parsed',
          );
          continue;
        }

        if (
          stepResult.finishReason === 'unknown' &&
          this.state.unknownRecoveryAttempts < UNKNOWN_RECOVERY_LIMIT
        ) {
          this.state.unknownRecoveryAttempts += 1;
          log.warn(
            {
              event: 'stream.unknown_finish.recovering',
              phase: 'step',
              streamRunId: this.ctx.streamRunId,
              sessionId: this.ctx.sessionId,
              messageId: this.ctx.assistantMessageId,
              step,
              attempt: this.state.unknownRecoveryAttempts,
              maxAttempts: UNKNOWN_RECOVERY_LIMIT,
            },
            'retrying step because finish reason was unknown without tool calls',
          );
          continue;
        }

        log.info(
          {
            event: 'stream.step.loop_break.no_tool_calls',
            phase: 'step',
            streamRunId: this.ctx.streamRunId,
            sessionId: this.ctx.sessionId,
            messageId: this.ctx.assistantMessageId,
            step,
            finishReason: stepResult.finishReason,
            toolCallCount: stepResult.toolCalls.length,
            responseMessageCount: stepResult.responseMessages.length,
            unknownRecoveryAttempts: this.state.unknownRecoveryAttempts,
            toolCallFinishRecoveryAttempts: this.state.toolCallFinishRecoveryAttempts,
          },
          'breaking step loop because there are no tool calls to execute',
        );

        break;
      }

      this.state.toolCallFinishRecoveryAttempts = 0;

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
        log.info(
          {
            event: 'stream.step.loop_break.doom_loop_stop',
            phase: 'step',
            streamRunId: this.ctx.streamRunId,
            sessionId: this.ctx.sessionId,
            messageId: this.ctx.assistantMessageId,
            step,
            doomLoopFinishReason: doomLoopState.finalFinishReason,
          },
          'breaking step loop because doom loop handler requested stop',
        );
        break;
      }
    }
  }

  private async maybeRunFinalSynthesis(): Promise<void> {
    this.runFinalSynthesis({
      triggerEvent: 'stream.final_synthesis.triggered',
      triggerReason: 'step-loop-complete',
      syntheticReason: 'missing-user-facing-text-after-tools',
    });
  }

  private async evaluateCompactionTrigger(): Promise<void> {
    const compactionSettings = await this.deps.getCompactionSettings();
    if (!compactionSettings.auto) {
      return;
    }

    const limits = await this.deps.getModelLimits(this.ctx.providerId, this.ctx.modelId);
    if (!isOverflow(this.state.totalUsage, limits, { reserved: compactionSettings.reserved })) {
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
      await this.handlePermissionRejected(error);
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

  private async handlePermissionRejected(error: unknown): Promise<void> {
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

    const resolvedToolCallIds = new Set(
      this.state.accumulatedParts
        .filter((p): p is StoredPart & { type: 'tool-result' } => p.type === 'tool-result')
        .map((p) => p.toolCallId),
    );

    const unresolvedToolCalls = this.state.accumulatedParts.filter(
      (p): p is StoredPart & { type: 'tool-call' } =>
        p.type === 'tool-call' && !resolvedToolCallIds.has(p.toolCallId),
    );

    for (const call of unresolvedToolCalls) {
      await this.deps.broadcast('stream-tool-state', {
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        status: 'error',
        error: 'Blocked before completion',
      });
    }
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
    const mappedError = mapAIError(error, this.ctx.providerId);

    const fallbackSucceeded = this.runFinalSynthesis({
      triggerEvent: 'stream.error_fallback_synthesis.triggered',
      triggerReason: 'error-path',
      syntheticReason: 'unhandled-stream-error',
    });

    if (fallbackSucceeded) {
      log.info(
        {
          event: 'stream.error_fallback_synthesis.succeeded',
          phase: 'error',
          streamRunId: this.ctx.streamRunId,
          sessionId: this.ctx.sessionId,
          messageId: this.ctx.assistantMessageId,
        },
        'error fallback synthesis succeeded',
      );
    }

    this.setFinishReason('error', 'unhandled-error');
    this.state.streamError = error;

    const errorDetails = toStreamErrorDetails(mappedError);
    this.state.accumulatedParts.push({
      type: 'stream-error',
      id: createPartId(),
      error: mappedError.message,
      details: errorDetails,
      startedAt: this.deps.now(),
      endedAt: this.deps.now(),
    } as StoredPart);

    await this.deps.broadcast('stream-error', {
      sessionId: this.ctx.sessionId,
      messageId: this.ctx.assistantMessageId,
      error: mappedError.message,
      details: toStreamErrorDetails(mappedError),
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

  private shouldRunFinalSynthesis(): boolean {
    if (this.state.finalSynthesisAttempted || this.state.wasAborted) {
      return false;
    }

    if (this.state.stepCount > MAX_STEPS) {
      return false;
    }

    if (!this.hasToolResultPart()) {
      return false;
    }

    return !this.hasTrailingUserFacingTextAfterLastToolResult();
  }

  private runFinalSynthesis(opts: {
    triggerEvent: string;
    triggerReason: string;
    syntheticReason: 'missing-user-facing-text-after-tools' | 'unhandled-stream-error';
  }): boolean {
    if (!this.shouldRunFinalSynthesis()) {
      return false;
    }

    this.state.finalSynthesisAttempted = true;

    log.warn(
      {
        event: opts.triggerEvent,
        phase: 'step',
        streamRunId: this.ctx.streamRunId,
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        finishReason: this.state.finalFinishReason,
        reason: opts.triggerReason,
        diagnostics: {
          stepCount: this.state.stepCount,
          lastStepFinishReason: this.state.lastStepFinishReason,
          lastStepToolCallCount: this.state.lastStepToolCallCount,
          lastStepResponseMessageCount: this.state.lastStepResponseMessageCount,
          unknownRecoveryAttempts: this.state.unknownRecoveryAttempts,
          toolCallFinishRecoveryAttempts: this.state.toolCallFinishRecoveryAttempts,
          hasToolResultPart: this.hasToolResultPart(),
          hasTrailingUserFacingTextAfterLastToolResult:
            this.hasTrailingUserFacingTextAfterLastToolResult(),
        },
      },
      'synthetic fallback response triggered because message had tool results without trailing user-facing text',
    );

    const now = this.deps.now();
    const text =
      opts.syntheticReason === 'unhandled-stream-error'
        ? 'I hit an internal error after running tools and could not complete the final response. Please retry this request.'
        : 'I could not produce a final response after running tools. Please retry this request.';

    this.state.accumulatedParts.push({
      type: 'text-delta',
      id: createPartId(),
      text,
      startedAt: now,
      endedAt: now,
    } as StoredPart);

    this.setFinishReason('error', 'synthetic-fallback-response');

    log.info(
      {
        event: 'stream.synthetic_fallback_response.added',
        phase: 'step',
        streamRunId: this.ctx.streamRunId,
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        reason: opts.syntheticReason,
        diagnostics: {
          stepCount: this.state.stepCount,
          lastStepFinishReason: this.state.lastStepFinishReason,
          lastStepToolCallCount: this.state.lastStepToolCallCount,
          lastStepResponseMessageCount: this.state.lastStepResponseMessageCount,
        },
      },
      'synthetic fallback response added',
    );

    return true;
  }

  private async persistAndLogFinish(): Promise<void> {
    this.ensureTerminalToolResults();

    const hasTrailingUserFacingText = this.hasTrailingUserFacingTextAfterLastToolResult();
    const hasToolResult = this.hasToolResultPart();
    if (hasToolResult && !hasTrailingUserFacingText) {
      log.warn(
        {
          event: 'stream.finished_without_user_text_after_tools',
          streamRunId: this.ctx.streamRunId,
          sessionId: this.ctx.sessionId,
          messageId: this.ctx.assistantMessageId,
          finishReason: this.state.finalFinishReason,
        },
        'stream finished without user-facing text after tools',
      );
    }

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

    await this.deps.markSessionUnread(this.ctx.sessionId);

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

  private hasUserFacingTextPart(): boolean {
    return this.state.accumulatedParts.some(
      (part) =>
        part.type === 'text-delta' && typeof part.text === 'string' && part.text.trim().length > 0,
    );
  }

  private hasTrailingUserFacingTextAfterLastToolResult(): boolean {
    let lastToolResultIndex = -1;

    for (let i = this.state.accumulatedParts.length - 1; i >= 0; i--) {
      if (this.state.accumulatedParts[i]?.type === 'tool-result') {
        lastToolResultIndex = i;
        break;
      }
    }

    if (lastToolResultIndex === -1) {
      return this.hasUserFacingTextPart();
    }

    for (let i = lastToolResultIndex + 1; i < this.state.accumulatedParts.length; i++) {
      const part = this.state.accumulatedParts[i];
      if (
        part?.type === 'text-delta' &&
        typeof part.text === 'string' &&
        part.text.trim().length > 0
      ) {
        return true;
      }
    }

    return false;
  }

  private hasToolResultPart(): boolean {
    return this.state.accumulatedParts.some((part) => part.type === 'tool-result');
  }

  private ensureTerminalToolResults(): void {
    const resolvedToolCallIds = new Set(
      this.state.accumulatedParts
        .filter((p): p is StoredPart & { type: 'tool-result' } => p.type === 'tool-result')
        .map((p) => p.toolCallId),
    );

    const missingToolCalls = this.state.accumulatedParts.filter(
      (p): p is StoredPart & { type: 'tool-call' } =>
        p.type === 'tool-call' && !resolvedToolCallIds.has(p.toolCallId),
    );

    if (missingToolCalls.length === 0) {
      return;
    }

    const fallbackError = this.state.wasAborted
      ? 'Aborted'
      : this.state.finalFinishReason === 'blocked'
        ? 'Blocked before completion'
        : 'Missing tool result';
    const now = this.deps.now();

    for (const call of missingToolCalls) {
      this.state.accumulatedParts.push({
        type: 'tool-result',
        id: createPartId(),
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: { error: fallbackError },
        truncated: false,
        startedAt: now,
        endedAt: now,
      } as StoredPart);
    }

    log.warn(
      {
        event: 'stream.tool.result_missing_repaired',
        streamRunId: this.ctx.streamRunId,
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        wasAborted: this.state.wasAborted,
        repairedToolCallIds: missingToolCalls.map((call) => call.toolCallId),
      },
      'missing tool results repaired before persist',
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
  agentId: PrefixedString<'agt'>;
  llmMessages: ModelMessage[];
  credentials: ProviderCredentials;
  abortSignal: AbortSignal;
}): Promise<void> {
  const streamRunId = randomUUID();
  const allStitchTools = createTools({
    sessionId: opts.sessionId,
    messageId: opts.assistantMessageId,
    agentId: opts.agentId,
    streamRunId,
  });

  const mcpTools = await createMcpToolsForAgent(opts.agentId, {
    sessionId: opts.sessionId,
    messageId: opts.assistantMessageId,
    agentId: opts.agentId,
    streamRunId,
  });

  const allTools = { ...allStitchTools, ...mcpTools };

  const disabledNames = await getDisabledToolNames(opts.agentId);
  const tools = Object.fromEntries(
    Object.entries(allTools).filter(([name]) => !disabledNames.has(name)),
  ) as ReturnType<typeof createTools>;

  const transformedMessages = await transformAttachmentsForModel(
    opts.llmMessages,
    opts.credentials.providerId,
    opts.modelId,
  );

  const runner = new StreamRunner({
    ...opts,
    llmMessages: transformedMessages,
    tools,
    streamRunId,
  });
  await runner.run();
}
