import type { PrefixedString } from '@stitch/shared/id';
import type { PermissionSuggestion } from '@stitch/shared/permissions/types';
import { isToolDataResult, isToolErrorResult } from '@stitch/shared/tools/types';

import * as Log from '@/lib/log.js';
import { PermissionRejectedError, StreamProtocolViolationError } from '@/llm/stream/errors.js';
import { getPermissionDecision, requestPermissionResponse } from '@/permission/service.js';
import { truncateOutput } from '@/tools/runtime/truncation.js';
import type { Tool } from 'ai';

const log = Log.create({ service: 'tools' });

export type ToolContext = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
};

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

type ToolPermissionBehavior = {
  getPatternTargets: (input: unknown) => string[];
  getSuggestion: (input: unknown) => PermissionSuggestion | null;
};

export function withTruncation<T extends Tool>(
  t: T,
  options?: { maxLines?: number; maxBytes?: number },
): T {
  const originalExecute = t.execute;
  if (!originalExecute) return t;

  const wrappedExecute = async (...args: Parameters<typeof originalExecute>) => {
    const execOptions = args[1] as unknown as Record<string, unknown> | undefined;
    if (execOptions?.['skipTruncation'] === true) {
      return originalExecute(...args);
    }

    const result = await originalExecute(...args);
    const text = getTruncatableText(result);
    const truncated = await truncateOutput(text, options);
    if (truncated.truncated) {
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
    }

    return result;
  };

  return { ...t, execute: wrappedExecute } as T;
}

export function withPermissionGate<T extends Tool>(
  toolName: string,
  behavior: ToolPermissionBehavior,
  t: T,
  context: ToolContext,
): T {
  const originalExecute = t.execute;
  if (!originalExecute) return t;

  const wrappedExecute = async (...args: Parameters<typeof originalExecute>) => {
    const input = args[0];
    const patternTargets = behavior.getPatternTargets(input);
    const permission = await getPermissionDecision({
      toolName,
      patternTargets,
    });

    if (permission === 'allow') {
      return originalExecute(...args);
    }

    if (permission === 'deny') {
      throw new PermissionRejectedError(toolName);
    }

    const meta = args[1] as { toolCallId: string; abortSignal?: AbortSignal } | undefined;
    const toolCallId = meta?.toolCallId;
    if (!toolCallId) {
      log.error(
        {
          event: 'stream.part.protocol_violation',
          toolName,
          sessionId: context.sessionId,
          messageId: context.messageId,
          streamRunId: context.streamRunId,
          hasMeta: meta !== undefined,
          metaKeys: meta ? Object.keys(meta) : [],
        },
        'missing toolCallId in tool execute context',
      );
      throw new StreamProtocolViolationError(`Missing toolCallId for ${toolName}`);
    }

    const decision = await requestPermissionResponse({
      sessionId: context.sessionId,
      messageId: context.messageId,
      streamRunId: context.streamRunId,
      toolCallId,
      toolName,
      toolInput: input,
      systemReminder: 'Tool execution requires user approval',
      suggestion: behavior.getSuggestion(input),
      abortSignal: meta?.abortSignal,
    });

    if (decision.decision === 'allow') {
      return originalExecute(...args);
    }

    if (decision.decision === 'alternative') {
      return {
        skipped: true,
        reason: 'user_requested_alternative',
        message: `User requested to do something else: ${decision.entry ?? ''}`,
      };
    }

    throw new PermissionRejectedError(toolName);
  };

  return { ...t, execute: wrappedExecute } as T;
}

export function withToolResultHandling<T extends Tool>(t: T): T {
  const originalExecute = t.execute;
  if (!originalExecute) return t;

  const wrappedExecute = async (...args: Parameters<typeof originalExecute>) => {
    const result = await originalExecute(...args);

    if (isToolErrorResult(result)) {
      throw new Error(result.error);
    }

    if (isToolDataResult(result)) {
      return result.data;
    }

    return result;
  };

  return { ...t, execute: wrappedExecute } as T;
}

export function withToolResultHandlingRecord<T extends Record<string, Tool>>(tools: T): T {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [name, withToolResultHandling(tool)]),
  ) as T;
}
