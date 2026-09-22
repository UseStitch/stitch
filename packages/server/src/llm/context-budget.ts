import { z } from 'zod';

import { estimate } from '@/utils/token.js';
import type { ModelMessage } from 'ai';

const DEFAULT_TOOL_RESULT_BUDGET_TOKENS = 1_000;
const TOOL_RESULT_BUDGET_TOKENS: Record<string, number | undefined> = { browser: 600, webfetch: 700, bash: 900 };

const TOOL_RESULT_PREVIEW_CHARS = 1_600;
const PRESERVE_RECENT_TOOL_RESULTS = 3;
const PRESERVE_RECENT_BROWSER_TOOL_RESULTS = 1;
const RECENT_BROWSER_TOOL_RESULT_BUDGET_TOKENS = 3_000;

type CompactableToolResult<T = unknown> = {
  toolName: string;
  output: T;
  truncated?: boolean;
  outputPath?: string | null;
};

/** Summary substituted for an over-budget tool output during context replay. */
export type CompactedToolSummary = {
  summary: string;
  toolName: string;
  estimatedTokens: number;
  truncated?: boolean;
  outputPath?: string | null;
  preview: string;
};

const toolResultErrorSchema = z.looseObject({ error: z.unknown() });
const stringOutputSchema = z.looseObject({ output: z.string().optional() });
const toolResultContentPartSchema = z.looseObject({
  type: z.literal('tool-result'),
  toolCallId: z.string(),
  toolName: z.string(),
  output: z.object({ type: z.string(), value: z.unknown() }),
});
const mediaContentPartSchema = z.looseObject({
  type: z.union([z.literal('image'), z.literal('file')]),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
});

type ToolResultContentPart = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: { type: string; value: unknown };
};

type MediaContentPart = { type: 'image' | 'file'; mediaType?: string; filename?: string };

export function isToolResultError(output: unknown): boolean {
  return toolResultErrorSchema.safeParse(output).success;
}

export function getToolResultBudget(toolName: string): number {
  const exactBudget = TOOL_RESULT_BUDGET_TOKENS[toolName];
  if (exactBudget !== undefined) {
    return exactBudget;
  }

  const prefix = toolName.split('_').at(0);
  const prefixBudget = prefix ? TOOL_RESULT_BUDGET_TOKENS[prefix] : undefined;
  if (prefixBudget !== undefined) {
    return prefixBudget;
  }

  return DEFAULT_TOOL_RESULT_BUDGET_TOKENS;
}

function toPreviewText(value: unknown): string {
  const stringValue = z.string().safeParse(value);
  if (stringValue.success) {
    return stringValue.data.slice(0, TOOL_RESULT_PREVIEW_CHARS);
  }

  const outputValue = stringOutputSchema.safeParse(value);
  if (outputValue.success && outputValue.data.output !== undefined) {
    return outputValue.data.output.slice(0, TOOL_RESULT_PREVIEW_CHARS);
  }

  const serialized = JSON.stringify(value) ?? '';
  return serialized.slice(0, TOOL_RESULT_PREVIEW_CHARS);
}

export function compactToolResultOutput<T>(
  part: CompactableToolResult<T>,
  budgetTokens = getToolResultBudget(part.toolName),
): T | CompactedToolSummary {
  const output = part.output;
  if (isToolResultError(output)) {
    return output;
  }

  const tokenEstimate = estimate(output);
  if (tokenEstimate <= budgetTokens) {
    return output;
  }

  return {
    summary: `Tool output compacted for context replay (${tokenEstimate} estimated tokens).`,
    toolName: part.toolName,
    estimatedTokens: tokenEstimate,
    truncated: part.truncated,
    outputPath: part.outputPath ?? null,
    preview: toPreviewText(output),
  };
}

function isToolResultContentPart(part: unknown): part is ToolResultContentPart {
  return toolResultContentPartSchema.safeParse(part).success;
}

function isMediaContentPart(part: unknown): part is MediaContentPart {
  return mediaContentPartSchema.safeParse(part).success;
}

function stripMediaPart(part: MediaContentPart): { type: 'text'; text: string } {
  const mediaType = part.mediaType ?? (part.type === 'image' ? 'image' : 'file');
  const label = part.filename ? `: ${part.filename}` : '';
  return { type: 'text', text: `[Attached ${mediaType}${label} already processed by model]` };
}

function toToolResultOutput(value: unknown): { type: 'text'; value: string } | { type: 'json'; value: unknown } {
  const parsed = z.string().safeParse(value);
  return parsed.success ? { type: 'text', value: parsed.data } : { type: 'json', value };
}

function countToolResults(
  conversation: ModelMessage[],
  predicate: (part: ToolResultContentPart) => boolean = () => true,
): number {
  let count = 0;
  for (const message of conversation) {
    if (message.role !== 'tool' || !Array.isArray(message.content)) {
      continue;
    }

    count += message.content.filter((part) => isToolResultContentPart(part) && predicate(part)).length;
  }

  return count;
}

export function compactConversationForStep(
  conversation: ModelMessage[],
  options?: { preserveRecentToolResults?: number; compactToolResults?: boolean },
): ModelMessage[] {
  const preserveRecentToolResults = options?.preserveRecentToolResults ?? PRESERVE_RECENT_TOOL_RESULTS;
  const compactToolResults = options?.compactToolResults ?? true;
  const lastUserMessageIndex = conversation.findLastIndex((message) => message.role === 'user');
  let remainingProtectedToolResults = preserveRecentToolResults;
  let remainingToolResults = countToolResults(conversation);
  let remainingBrowserToolResults = countToolResults(conversation, (part) => part.toolName.startsWith('browser_'));

  const compacted = conversation.map((message, messageIndex): ModelMessage => {
    if (message.role === 'user' && Array.isArray(message.content) && messageIndex !== lastUserMessageIndex) {
      const content = message.content.map((part) => (isMediaContentPart(part) ? stripMediaPart(part) : part));
      const contentChanged = content.some((part, i) => part !== message.content[i]);

      if (contentChanged) {
        return { ...message, content } as ModelMessage;
      }
    }

    if (message.role !== 'tool' || !Array.isArray(message.content)) {
      return message;
    }

    const content = message.content.map((part) => {
      if (!isToolResultContentPart(part)) {
        return part;
      }

      const isBrowserTool = part.toolName.startsWith('browser_');
      const isProtected = isBrowserTool
        ? remainingBrowserToolResults <= PRESERVE_RECENT_BROWSER_TOOL_RESULTS
        : remainingToolResults <= remainingProtectedToolResults;
      remainingToolResults -= 1;
      if (isBrowserTool) {
        remainingBrowserToolResults -= 1;
      }
      if (!compactToolResults || isProtected) {
        if (compactToolResults && isBrowserTool && isProtected) {
          const compactedOutput = compactToolResultOutput(
            { toolName: part.toolName, output: part.output.value },
            RECENT_BROWSER_TOOL_RESULT_BUDGET_TOKENS,
          );
          if (compactedOutput !== part.output.value) {
            return { ...part, output: toToolResultOutput(compactedOutput) };
          }
        }
        return part;
      }

      const compactedOutput = compactToolResultOutput({ toolName: part.toolName, output: part.output.value });
      if (compactedOutput === part.output.value) {
        return part;
      }

      return { ...part, output: toToolResultOutput(compactedOutput) };
    });

    if (content.some((part, i) => part !== message.content[i])) {
      return { ...message, content } as ModelMessage;
    }

    return message;
  });

  const changed = compacted.some((message, i) => message !== conversation[i]);
  return changed ? compacted : conversation;
}
