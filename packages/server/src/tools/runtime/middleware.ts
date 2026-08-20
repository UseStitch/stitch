import { isToolDataResult, isToolErrorResult } from '@stitch/shared/tools/types';

import * as Log from '@/lib/log.js';
import { PermissionRejectedError, StreamProtocolViolationError } from '@/llm/stream/errors.js';
import { getPermissionDecision, requestPermissionResponse } from '@/permission/service.js';
import { ToolError } from '@/tools/errors.js';
import type { ToolExecutionInput, ToolMiddleware, ToolTruncationLimits } from '@/tools/runtime/runtime.js';
import { truncateOutput } from '@/tools/runtime/truncation.js';

const log = Log.create({ service: 'tools' });

function createPermissionDedupeKey(input: ToolExecutionInput, patternTargets: string[]): string {
  return JSON.stringify([
    input.context.sessionId,
    input.context.messageId,
    input.context.streamRunId,
    input.toolName,
    [...patternTargets].toSorted(),
  ]);
}

type TruncationMeta = { __stitchToolResultMeta: { truncated: true; outputPath: string } };

function hasStringOutput(result: unknown): result is { output: string } {
  return typeof result === 'object' && result !== null && 'output' in result && typeof result.output === 'string';
}

function getTruncatableText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (hasStringOutput(result)) return result.output;

  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

export function resultNormalizationMiddleware(): ToolMiddleware {
  return (next) => async (input) => {
    const result = await next(input);

    if (isToolErrorResult(result)) {
      throw new ToolError(result.error, input.toolName, result.details);
    }

    if (isToolDataResult(result)) {
      return result.data;
    }

    return result;
  };
}

export function truncationMiddleware(options?: ToolTruncationLimits): ToolMiddleware {
  return (next) => async (input) => {
    if (input.executeOptions.skipTruncation === true) {
      return next(input);
    }

    const result = await next(input);
    const text = getTruncatableText(result);
    const truncated = await truncateOutput(text, input.metadata.truncation ?? options);
    if (!truncated.truncated) {
      return result;
    }

    const meta: TruncationMeta = { __stitchToolResultMeta: { truncated: true, outputPath: truncated.outputPath } };

    if (hasStringOutput(result)) {
      return { ...result, output: truncated.content, ...meta };
    }

    return { output: truncated.content, ...meta };
  };
}

export function permissionMiddleware(): ToolMiddleware {
  return (next) => async (input) => {
    const behavior = input.metadata.permission;
    if (!behavior) {
      return next(input);
    }

    const patternTargets = behavior.getPatternTargets(input.args);
    const permission = await getPermissionDecision({ toolName: input.toolName, patternTargets });

    if (permission === 'allow') {
      return next(input);
    }

    if (permission === 'deny') {
      throw new PermissionRejectedError(input.toolName);
    }

    const { toolCallId, abortSignal } = input.executeOptions;
    if (!toolCallId) {
      log.error(
        {
          event: 'stream.part.protocol_violation',
          toolName: input.toolName,
          sessionId: input.context.sessionId,
          messageId: input.context.messageId,
          streamRunId: input.context.streamRunId,
          metaKeys: Object.keys(input.executeOptions),
        },
        'missing toolCallId in tool execute context',
      );
      throw new StreamProtocolViolationError(`Missing toolCallId for ${input.toolName}`);
    }

    const decision = await requestPermissionResponse({
      sessionId: input.context.sessionId,
      messageId: input.context.messageId,
      streamRunId: input.context.streamRunId,
      toolCallId,
      toolName: input.toolName,
      toolInput: input.args,
      systemReminder: 'Tool execution requires user approval',
      suggestion: behavior.getSuggestion?.(input.args) ?? null,
      dedupeKey: createPermissionDedupeKey(input, patternTargets),
      abortSignal,
    });

    if (decision.decision === 'allow') {
      return next(input);
    }

    if (decision.decision === 'alternative') {
      return {
        skipped: true,
        reason: 'user_requested_alternative',
        message: `User requested to do something else: ${decision.entry ?? ''}`,
      };
    }

    throw new PermissionRejectedError(input.toolName);
  };
}
