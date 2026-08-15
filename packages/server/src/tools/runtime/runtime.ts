import type { PrefixedString } from '@stitch/shared/id';
import type { PermissionSuggestion } from '@stitch/shared/permissions/types';
import { isToolDataResult, isToolErrorResult } from '@stitch/shared/tools/types';

import * as Log from '@/lib/log.js';
import { PermissionRejectedError, StreamProtocolViolationError } from '@/llm/stream/errors.js';
import { getPermissionDecision, requestPermissionResponse } from '@/permission/service.js';
import { ToolError } from '@/tools/errors.js';
import { truncateOutput } from '@/tools/runtime/truncation.js';
import type { Tool, ToolExecutionOptions } from 'ai';

const log = Log.create({ service: 'tool-runtime' });

export type ToolContext = { sessionId: PrefixedString<'ses'>; messageId: PrefixedString<'msg'>; streamRunId: string };

type RuntimeToolSource = 'core' | 'toolset' | 'mcp' | 'meta' | 'task' | 'code-mode';

export type ToolInput = Record<string, unknown>;
export type ToolExecuteOptions = ToolExecutionOptions & { skipTruncation?: boolean };
type ToolTruncationLimits = { maxLines?: number; maxBytes?: number };

type ToolPermissionBehavior = {
  getPatternTargets: (input: ToolInput) => string[];
  getSuggestion: (input: ToolInput) => PermissionSuggestion | null;
};

export type ToolDefinition = {
  name: string;
  displayName: string;
  tool: Tool;
  source?: RuntimeToolSource;
  permission?: ToolPermissionBehavior;
  truncation?: ToolTruncationLimits;
};

type TruncationMeta = { __stitchToolResultMeta: { truncated: true; outputPath: string } };

function createPermissionDedupeKey(context: ToolContext, toolName: string, patternTargets: string[]): string {
  return JSON.stringify([
    context.sessionId,
    context.messageId,
    context.streamRunId,
    toolName,
    [...patternTargets].toSorted(),
  ]);
}

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

export async function executeRuntimeTool(
  def: ToolDefinition,
  context: ToolContext,
  args: ToolInput,
  executeOptions: ToolExecuteOptions = {} as ToolExecuteOptions,
): Promise<unknown> {
  const originalExecute = def.tool.execute;
  if (!originalExecute) {
    return undefined;
  }

  // 1. Permission check and user approval prompt
  if (def.permission) {
    const patternTargets = def.permission.getPatternTargets(args);
    const permission = await getPermissionDecision({ toolName: def.name, patternTargets });

    if (permission === 'deny') {
      throw new PermissionRejectedError(def.name);
    }

    if (permission !== 'allow') {
      const { toolCallId, abortSignal } = executeOptions;
      if (!toolCallId) {
        log.error(
          {
            event: 'stream.part.protocol_violation',
            toolName: def.name,
            sessionId: context.sessionId,
            messageId: context.messageId,
            streamRunId: context.streamRunId,
            metaKeys: Object.keys(executeOptions),
          },
          'missing toolCallId in tool execute context',
        );
        throw new StreamProtocolViolationError(`Missing toolCallId for ${def.name}`);
      }

      const decision = await requestPermissionResponse({
        sessionId: context.sessionId,
        messageId: context.messageId,
        streamRunId: context.streamRunId,
        toolCallId,
        toolName: def.name,
        toolInput: args,
        systemReminder: 'Tool execution requires user approval',
        suggestion: def.permission.getSuggestion(args),
        dedupeKey: createPermissionDedupeKey(context, def.name, patternTargets),
        abortSignal,
      });

      if (decision.decision === 'reject') {
        throw new PermissionRejectedError(def.name);
      }

      if (decision.decision === 'alternative') {
        return {
          skipped: true,
          reason: 'user_requested_alternative',
          message: `User requested to do something else: ${decision.entry ?? ''}`,
        };
      }
    }
  }

  // 2. Invoke underlying tool execution
  let result = await originalExecute(args, executeOptions);

  // 3. Truncation
  if (executeOptions.skipTruncation !== true) {
    const text = getTruncatableText(result);
    const truncated = await truncateOutput(text, def.truncation);
    if (truncated.truncated) {
      const meta: TruncationMeta = { __stitchToolResultMeta: { truncated: true, outputPath: truncated.outputPath } };
      result = hasStringOutput(result)
        ? { ...result, output: truncated.content, ...meta }
        : { output: truncated.content, ...meta };
    }
  }

  // 4. Result normalization
  if (isToolErrorResult(result)) {
    throw new ToolError(result.error, def.name, result.details);
  }

  if (isToolDataResult(result)) {
    return result.data;
  }

  return result;
}

export function bindTool<T extends Tool = Tool>(context: ToolContext, def: ToolDefinition): T {
  const originalExecute = def.tool.execute;
  if (!originalExecute) return def.tool as T;

  return {
    ...def.tool,
    execute: async (args: ToolInput, executeOptions: ToolExecuteOptions) =>
      executeRuntimeTool(def, context, args, executeOptions),
  } as T;
}

export function bindTools(context: ToolContext, defs: ToolDefinition[]): Record<string, Tool> {
  return Object.fromEntries(defs.map((def) => [def.name, bindTool(context, def)]));
}
