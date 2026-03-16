import type { PermissionSuggestion, PrefixedString } from '@openwork/shared';

import * as Log from '@/lib/log.js';
import { getAgentPermissionDecision, requestPermissionResponse } from '@/permission/service.js';
import { createQuestionTool } from '@/tools/question.js';
import { truncateOutput } from '@/tools/truncation.js';
import { createWeatherTool } from '@/tools/weather.js';
import { createWebfetchTool, extractDomainForPermission } from '@/tools/webfetch.js';
import type { Tool } from 'ai';

const log = Log.create({ service: 'tools' });

export const MAX_STEPS = 25;

export const MAX_STEPS_WARNING = (max: number) =>
  `CRITICAL: You are on step ${max} (final step). Tools will be disabled after this. Complete all remaining work and provide your final answer.`;

type ToolPermissionBehavior = {
  getPatternTargets?: (input: unknown) => string[];
  getSuggestion?: (input: unknown) => PermissionSuggestion | null;
};

const TOOL_PERMISSION_BEHAVIORS: Partial<Record<string, ToolPermissionBehavior>> = {
  weather: {
    getPatternTargets: (input) => {
      const location = (input as { location?: unknown })?.location;
      return typeof location === 'string' && location.length > 0 ? [location] : [];
    },
    getSuggestion: (input) => {
      const location = (input as { location?: unknown })?.location;
      if (typeof location !== 'string' || location.length === 0) return null;
      return {
        message: `Always allow weather for ${location}`,
        pattern: location,
      };
    },
  },
  webfetch: {
    getPatternTargets: (input) => {
      const url = (input as { url?: unknown })?.url;
      if (typeof url !== 'string' || url.length === 0) return [];
      const domain = extractDomainForPermission(url);
      return domain ? [domain] : [];
    },
    getSuggestion: (input) => {
      const url = (input as { url?: unknown })?.url;
      if (typeof url !== 'string' || url.length === 0) return null;
      const domain = extractDomainForPermission(url);
      if (!domain) return null;
      return {
        message: `Always allow from ${domain}`,
        pattern: domain,
      };
    },
  },
};

function withTruncation<T extends Tool>(t: T): T {
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

function withPermissionGate<T extends Tool>(
  toolName: string,
  t: T,
  context: {
    sessionId: PrefixedString<'ses'>;
    messageId: PrefixedString<'msg'>;
    agentId: PrefixedString<'agt'>;
  },
): T {
  const originalExecute = t.execute;
  if (!originalExecute) return t;

  const wrappedExecute = async (...args: Parameters<typeof originalExecute>) => {
    const input = args[0];
    const behavior = TOOL_PERMISSION_BEHAVIORS[toolName];
    const patternTargets = behavior?.getPatternTargets?.(input) ?? [];
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
      suggestion: behavior?.getSuggestion?.(input) ?? null,
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

export function createTools(context: {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  agentId: PrefixedString<'agt'>;
}) {
  const weatherTool = withTruncation(withPermissionGate('weather', createWeatherTool(), context));
  const webfetchTool = withTruncation(withPermissionGate('webfetch', createWebfetchTool(), context));
  const questionTool = withPermissionGate('question', createQuestionTool(context), context);

  return {
    weather: weatherTool,
    webfetch: webfetchTool,
    question: questionTool,
  };
}
