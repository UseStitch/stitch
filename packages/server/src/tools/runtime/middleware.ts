import { isToolDataResult, isToolErrorResult } from '@stitch/shared/tools/types';

import * as Log from '@/lib/log.js';
import { PermissionRejectedError, StreamProtocolViolationError } from '@/llm/stream/errors.js';
import { getPermissionDecision, requestPermissionResponse } from '@/permission/service.js';
import { truncateOutput } from '@/tools/runtime/truncation.js';
import type { ToolMiddleware } from '@/tools/runtime/runtime.js';

const log = Log.create({ service: 'tools' });

type TruncationMeta = {
  __stitchToolResultMeta: {
    truncated: true;
    outputPath: string;
  };
};

function getTruncatableText(result: unknown): string {
  if (typeof result === 'string') return result;

  if (result !== null && typeof result === 'object') {
    const output = (result as { output?: unknown }).output;
    if (typeof output === 'string') return output;
  }

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
      throw new Error(result.error);
    }

    if (isToolDataResult(result)) {
      return result.data;
    }

    return result;
  };
}

export function truncationMiddleware(options?: { maxLines?: number; maxBytes?: number }): ToolMiddleware {
  return (next) => async (input) => {
    const execOptions = input.executeOptions as Record<string, unknown> | undefined;
    if (execOptions?.['skipTruncation'] === true) {
      return next(input);
    }

    const result = await next(input);
    const text = getTruncatableText(result);
    const truncated = await truncateOutput(text, input.metadata.truncation ?? options);
    if (!truncated.truncated) {
      return result;
    }

    const meta: TruncationMeta = {
      __stitchToolResultMeta: {
        truncated: true,
        outputPath: truncated.outputPath,
      },
    };

    if (typeof result === 'string') {
      return {
        output: truncated.content,
        ...meta,
      };
    }

    if (
      result !== null &&
      typeof result === 'object' &&
      typeof (result as { output?: unknown }).output === 'string'
    ) {
      return {
        ...result,
        output: truncated.content,
        ...meta,
      };
    }

    return {
      output: truncated.content,
      ...meta,
    };
  };
}

export function permissionMiddleware(): ToolMiddleware {
  return (next) => async (input) => {
    const behavior = input.metadata.permission;
    if (!behavior) {
      return next(input);
    }

    const patternTargets = behavior.getPatternTargets(input.args);
    const permission = await getPermissionDecision({
      toolName: input.toolName,
      patternTargets,
    });

    if (permission === 'allow') {
      return next(input);
    }

    if (permission === 'deny') {
      throw new PermissionRejectedError(input.toolName);
    }

    const meta = input.executeOptions as { toolCallId: string; abortSignal?: AbortSignal } | undefined;
    const toolCallId = meta?.toolCallId;
    if (!toolCallId) {
      log.error(
        {
          event: 'stream.part.protocol_violation',
          toolName: input.toolName,
          sessionId: input.context.sessionId,
          messageId: input.context.messageId,
          streamRunId: input.context.streamRunId,
          hasMeta: meta !== undefined,
          metaKeys: meta ? Object.keys(meta) : [],
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
      suggestion: behavior.getSuggestion(input.args),
      abortSignal: meta?.abortSignal,
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
