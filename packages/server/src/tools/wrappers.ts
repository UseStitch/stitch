import type { PermissionSuggestion, PrefixedString } from '@openwork/shared';

import * as Log from '@/lib/log.js';
import { getAgentPermissionDecision, requestPermissionResponse } from '@/permission/service.js';
import { truncateOutput } from '@/tools/truncation.js';
import type { Tool } from 'ai';

const log = Log.create({ service: 'tools' });

export type ToolContext = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  agentId: PrefixedString<'agt'>;
};

type ToolPermissionBehavior = {
  getPatternTargets: (input: unknown) => string[];
  getSuggestion: (input: unknown) => PermissionSuggestion | null;
};

export function withTruncation<T extends Tool>(t: T): T {
  const originalExecute = t.execute;
  if (!originalExecute) return t;

  const wrappedExecute = async (...args: Parameters<typeof originalExecute>) => {
    const result = await originalExecute(...args);
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    const truncated = await truncateOutput(text);
    if (truncated.truncated) return truncated.content;
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
    const permission = await getAgentPermissionDecision({
      agentId: context.agentId,
      toolName,
      patternTargets,
    });

    if (permission === 'allow') {
      return originalExecute(...args);
    }

    if (permission === 'deny') {
      throw new Error(`User rejected tool execution for ${toolName}`);
    }

    const meta = args[1] as { toolCallId: string; abortSignal?: AbortSignal } | undefined;
    const toolCallId = meta?.toolCallId;
    if (!toolCallId) {
      log.error('missing toolCallId in tool execute context', {
        toolName,
        sessionId: context.sessionId,
        messageId: context.messageId,
        hasMeta: meta !== undefined,
        metaKeys: meta ? Object.keys(meta) : [],
      });
      throw new Error(`Missing toolCallId for ${toolName}`);
    }

    const decision = await requestPermissionResponse({
      sessionId: context.sessionId,
      messageId: context.messageId,
      agentId: context.agentId,
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

    throw new Error(`User rejected tool execution for ${toolName}`);
  };

  return { ...t, execute: wrappedExecute } as T;
}
