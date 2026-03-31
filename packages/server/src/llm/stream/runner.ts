import { randomUUID } from 'node:crypto';

import type { StoredPart } from '@stitch/shared/chat/messages';
import { createPartId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { markSessionUnread } from '@/chat/service.js';
import { getDb } from '@/db/client.js';
import { messages } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import * as Sse from '@/lib/sse.js';
import { transformAttachmentsForModel } from '@/llm/attachment-transform.js';
import { isOverflow, compact, getCompactionSettings, getModelLimits } from '@/llm/compaction.js';
import { mapAIError, toStreamErrorDetails } from '@/llm/stream/ai-error-mapper.js';
import { checkAndHandleDoomLoop, type ToolCallRecord } from '@/llm/stream/doom-loop.js';
import {
  getErrorCode,
  getErrorMessage,
  isContextOverflowError,
  isPermissionRejectedError,
  isStreamAbortedError,
} from '@/llm/stream/errors.js';
import {
  getSessionActiveToolsetIds,
  setSessionActiveToolsetIds,
} from '@/llm/stream/session-toolsets.js';
import { executeStepWithRetry, type StepOptions } from '@/llm/stream/step-executor.js';
import { createProvider } from '@/provider/provider.js';
import type { ProviderCredentials } from '@/provider/provider.js';
import { createTaskTool } from '@/tools/core/task.js';
import { createToolsetTools } from '@/tools/core/toolset-management.js';
import { createTools, MAX_STEPS, MAX_STEPS_WARNING } from '@/tools/runtime/registry.js';
import { ToolsetManager } from '@/tools/toolsets/manager.js';
import { recordUsageEvent } from '@/usage/ledger.js';
import { calculateMessageCostUsd } from '@/utils/cost.js';
import * as Usage from '@/utils/usage.js';
import type { ModelMessage, LanguageModelUsage, Tool } from 'ai';

const log = Log.create({ service: 'stream-runner' });

async function saveAssistantMessage(opts: {
  sessionId: PrefixedString<'ses'>;
  assistantMessageId: PrefixedString<'msg'>;
  modelId: string;
  providerId: string;
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

async function safeRecordUsageEvent(input: Parameters<typeof recordUsageEvent>[0]): Promise<void> {
  if (process.env.VITEST === 'true') {
    return;
  }

  try {
    await recordUsageEvent(input);
  } catch (error) {
    log.warn({ error, source: input.source, runId: input.runId }, 'usage event write failed');
  }
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
  llmMessages: ModelMessage[];
  credentials: ProviderCredentials;
  abortSignal: AbortSignal;
  /** Toolset IDs to pre-activate (e.g. inherited from parent session) */
  activeToolsetIds?: string[];
  streamRunId?: string;
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
  abortSignal: AbortSignal;
  streamRunId: string;
  startedAt: number;
  model: ReturnType<ReturnType<typeof createProvider>>;
  /** Always-active tools (core + meta-tools + task) — never change during a run */
  coreTools: Record<string, Tool>;
  /** Manages dynamic toolset activation/deactivation */
  toolsetManager: ToolsetManager;
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
  peakStepUsage: LanguageModelUsage;
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

type InternalRunStreamOptions = RunStreamOptions & {
  coreTools: Record<string, Tool>;
  toolsetManager: ToolsetManager;
  streamRunId: string;
};

class StreamRunner {
  private readonly ctx: StreamRunnerContext;
  private readonly state: StreamRunnerState;
  private readonly deps: StreamRunnerDeps;

  constructor(opts: InternalRunStreamOptions, deps: Partial<StreamRunnerDeps> = {}) {
    const provider = createProvider(opts.credentials);
    const model = provider(opts.modelId);
    const startedAt = Date.now();

    this.ctx = {
      sessionId: opts.sessionId,
      assistantMessageId: opts.assistantMessageId,
      modelId: opts.modelId,
      providerId: opts.credentials.providerId,
      abortSignal: opts.abortSignal,
      streamRunId: opts.streamRunId,
      startedAt,
      model,
      coreTools: opts.coreTools,
      toolsetManager: opts.toolsetManager,
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
      peakStepUsage: Usage.ZERO_USAGE,
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

  /**
   * Build the current tool map: always-active core tools + dynamic toolset tools.
   * Called each step to reflect any activate/deactivate changes.
   */
  private getCurrentTools(): Record<string, Tool> {
    const dynamicTools = this.ctx.toolsetManager.getActiveTools();
    const all = { ...this.ctx.coreTools, ...dynamicTools };
    return Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)));
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
      tools: this.getCurrentTools(),
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
          role: 'user',
          content: MAX_STEPS_WARNING(MAX_STEPS),
        });
      }

      const stepStartedAt = this.deps.now();

      const stepResult = await this.deps.executeStepWithRetry({
        ...this.buildStepOptions(step),
        tools: isLastStep ? ({} as StepOptions['tools']) : this.getCurrentTools(),
        onAttemptFailure: async ({ attempt, errorCode, isRetryable }) => {
          const now = this.deps.now();
          await safeRecordUsageEvent({
            runId: this.ctx.streamRunId,
            source: 'chat',
            status: 'failed',
            sessionId: this.ctx.sessionId,
            messageId: this.ctx.assistantMessageId,
            providerId: this.ctx.providerId,
            modelId: this.ctx.modelId,
            costUsd: 0,
            errorCode,
            stepIndex: step + 1,
            attemptIndex: attempt,
            metadata: {
              phase: 'chat-step',
              eventType: 'attempt-failure',
              streamRunId: this.ctx.streamRunId,
              isRetryable,
            },
            startedAt: now,
            endedAt: now,
            durationMs: 0,
          });
        },
      });
      this.state.totalUsage = Usage.addUsage(this.state.totalUsage, stepResult.usage);
      this.updatePeakStepUsage(stepResult.usage);
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
          cumulativeUsage: this.state.totalUsage,
          toolCallCount: stepResult.toolCalls.length,
          protocolViolationCount: this.state.protocolViolationCount,
        },
        'stream.step.finished',
      );

      const stepFinishedAt = this.deps.now();
      const stepCostUsd = await calculateMessageCostUsd({
        providerId: this.ctx.providerId,
        modelId: this.ctx.modelId,
        usage: stepResult.usage,
      });
      await safeRecordUsageEvent({
        runId: this.ctx.streamRunId,
        source: 'chat',
        status: 'succeeded',
        sessionId: this.ctx.sessionId,
        messageId: this.ctx.assistantMessageId,
        providerId: this.ctx.providerId,
        modelId: this.ctx.modelId,
        usage: stepResult.usage,
        costUsd: stepCostUsd,
        stepIndex: step + 1,
        attemptIndex: stepResult.attemptCount,
        metadata: {
          phase: 'chat-step',
          eventType: 'step-success',
          finishReason: stepResult.finishReason,
        },
        startedAt: stepStartedAt,
        endedAt: stepFinishedAt,
        durationMs: stepFinishedAt - stepStartedAt,
      });

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
        onDoomLoopAttemptFailure: async ({ attempt, errorCode, isRetryable }) => {
          const now = this.deps.now();
          await safeRecordUsageEvent({
            runId: this.ctx.streamRunId,
            source: 'doom_loop_summary',
            status: 'failed',
            sessionId: this.ctx.sessionId,
            messageId: this.ctx.assistantMessageId,
            providerId: this.ctx.providerId,
            modelId: this.ctx.modelId,
            costUsd: 0,
            errorCode,
            attemptIndex: attempt,
            metadata: {
              phase: 'doom-loop',
              eventType: 'attempt-failure',
              streamRunId: this.ctx.streamRunId,
              isRetryable,
            },
            startedAt: now,
            endedAt: now,
            durationMs: 0,
          });
        },
      });

      this.state.totalUsage = doomLoopState.totalUsage;
      this.setFinishReason(doomLoopState.finalFinishReason, 'doom-loop');
      if (doomLoopState.summaryUsage) {
        const now = this.deps.now();
        const summaryCostUsd = await calculateMessageCostUsd({
          providerId: this.ctx.providerId,
          modelId: this.ctx.modelId,
          usage: doomLoopState.summaryUsage,
        });
        await safeRecordUsageEvent({
          runId: this.ctx.streamRunId,
          source: 'doom_loop_summary',
          status: 'succeeded',
          sessionId: this.ctx.sessionId,
          messageId: this.ctx.assistantMessageId,
          providerId: this.ctx.providerId,
          modelId: this.ctx.modelId,
          usage: doomLoopState.summaryUsage,
          costUsd: summaryCostUsd,
          metadata: {
            phase: 'doom-loop',
            eventType: 'summary-after-stop',
          },
          startedAt: now,
          endedAt: now,
          durationMs: 0,
        });
      }
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
    const contextPressureUsage = this.state.peakStepUsage;

    if (!isOverflow(contextPressureUsage, limits, { reserved: compactionSettings.reserved })) {
      return;
    }

    this.setNeedsCompaction(true, 'token-overflow');
    log.info(
      {
        event: 'stream.compaction.triggered',
        phase: 'compaction',
        streamRunId: this.ctx.streamRunId,
        sessionId: this.ctx.sessionId,
        peakStepInputTokens: contextPressureUsage.inputTokens,
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
      accumulatedParts: this.state.accumulatedParts,
      totalUsage: this.state.totalUsage,
      finalFinishReason: this.state.finalFinishReason,
      startedAt: this.ctx.startedAt,
    });

    await this.deps.markSessionUnread(this.ctx.sessionId);
    setSessionActiveToolsetIds(this.ctx.sessionId, this.ctx.toolsetManager.getActiveIds());

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
        peakStepUsage: this.state.peakStepUsage,
        totalUsage: this.state.totalUsage,
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

  private updatePeakStepUsage(stepUsage: LanguageModelUsage): void {
    const currentInput = this.state.peakStepUsage.inputTokens ?? 0;
    const nextInput = stepUsage.inputTokens ?? 0;
    if (nextInput <= currentInput) {
      return;
    }

    this.state.peakStepUsage = {
      ...Usage.ZERO_USAGE,
      ...stepUsage,
      inputTokenDetails: {
        ...Usage.ZERO_USAGE.inputTokenDetails,
        ...stepUsage.inputTokenDetails,
      },
      outputTokenDetails: {
        ...Usage.ZERO_USAGE.outputTokenDetails,
        ...stepUsage.outputTokenDetails,
      },
    };
  }
}

export async function runStream(opts: {
  sessionId: PrefixedString<'ses'>;
  assistantMessageId: PrefixedString<'msg'>;
  modelId: string;
  llmMessages: ModelMessage[];
  credentials: ProviderCredentials;
  abortSignal: AbortSignal;
  /** Toolset IDs to pre-activate (e.g. inherited from parent task) */
  activeToolsetIds?: string[];
}): Promise<void> {
  const streamRunId = randomUUID();

  const toolContext = {
    sessionId: opts.sessionId,
    messageId: opts.assistantMessageId,
    streamRunId,
  };

  // Create per-session toolset manager
  const toolsetManager = new ToolsetManager(toolContext);

  // Pre-activate requested toolsets (inherited from parent or explicit)
  const toolsetIdsToActivate = opts.activeToolsetIds ?? getSessionActiveToolsetIds(opts.sessionId);
  if (toolsetIdsToActivate.length > 0) {
    await Promise.all(toolsetIdsToActivate.map((id) => toolsetManager.activate(id)));
  }

  // Build always-active core tools
  const coreStitchTools = createTools(toolContext);

  // Build meta-tools (bound to this session's toolset manager)
  const toolsetMetaTools = createToolsetTools(toolsetManager);

  // Build task tool (bound to this session's context)
  const taskTool = createTaskTool(toolContext, {
    parentSessionId: opts.sessionId,
    parentAbortSignal: opts.abortSignal,
    credentials: opts.credentials,
    modelId: opts.modelId,
    providerId: opts.credentials.providerId,
    toolsetManager,
  });

  // Combine all always-active tools
  const coreTools: Record<string, Tool> = {
    ...coreStitchTools,
    ...toolsetMetaTools,
    task: taskTool,
  };

  const transformedMessages = await transformAttachmentsForModel(
    opts.llmMessages,
    opts.credentials.providerId,
    opts.modelId,
  );

  const runner = new StreamRunner({
    ...opts,
    llmMessages: transformedMessages,
    coreTools,
    toolsetManager,
    streamRunId,
  });
  await runner.run();
}
