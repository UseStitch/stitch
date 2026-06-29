import { estimate } from '@/utils/token.js';
import type { ModelMessage } from 'ai';

const DEFAULT_TOOL_RESULT_BUDGET_TOKENS = 1_000;
const TOOL_RESULT_BUDGET_TOKENS: Record<string, number> = {
  browser: 600,
  webfetch: 700,
  bash: 900,
};

const TOOL_RESULT_PREVIEW_CHARS = 1_600;
const PRESERVE_RECENT_TOOL_RESULTS = 3;
const PRESERVE_RECENT_BROWSER_TOOL_RESULTS = 1;
const RECENT_BROWSER_TOOL_RESULT_BUDGET_TOKENS = 3_000;

type CompactableToolResult = {
  toolName: string;
  output: unknown;
  truncated?: boolean;
  outputPath?: string | null;
};

type ToolResultContentPart = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: { type: string; value: unknown };
};

type MediaContentPart = {
  type: 'image' | 'file';
  mediaType?: string;
  filename?: string;
};

export function isToolResultError(output: unknown): boolean {
  return output !== null && output !== undefined && typeof output === 'object' && 'error' in output;
}

export function getToolResultBudget(toolName: string): number {
  if (TOOL_RESULT_BUDGET_TOKENS[toolName] !== undefined) {
    return TOOL_RESULT_BUDGET_TOKENS[toolName];
  }

  const prefix = toolName.split('_')[0];
  if (prefix && TOOL_RESULT_BUDGET_TOKENS[prefix] !== undefined) {
    return TOOL_RESULT_BUDGET_TOKENS[prefix];
  }

  return DEFAULT_TOOL_RESULT_BUDGET_TOKENS;
}

function toPreviewText(value: unknown): string {
  if (typeof value === 'string') {
    return value.slice(0, TOOL_RESULT_PREVIEW_CHARS);
  }

  if (value && typeof value === 'object') {
    const output = (value as { output?: unknown }).output;
    if (typeof output === 'string') {
      return output.slice(0, TOOL_RESULT_PREVIEW_CHARS);
    }
  }

  const serialized = JSON.stringify(value);
  return serialized.slice(0, TOOL_RESULT_PREVIEW_CHARS);
}

export function compactToolResultOutput(
  part: CompactableToolResult,
  budgetTokens = getToolResultBudget(part.toolName),
): unknown {
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
  return (
    part !== null &&
    typeof part === 'object' &&
    (part as { type?: unknown }).type === 'tool-result' &&
    typeof (part as { toolName?: unknown }).toolName === 'string' &&
    typeof (part as { output?: { type?: unknown } }).output?.type === 'string'
  );
}

function isMediaContentPart(part: unknown): part is MediaContentPart {
  return (
    part !== null &&
    typeof part === 'object' &&
    ((part as { type?: unknown }).type === 'image' || (part as { type?: unknown }).type === 'file')
  );
}

function stripMediaPart(part: MediaContentPart): { type: 'text'; text: string } {
  const mediaType = part.mediaType ?? (part.type === 'image' ? 'image' : 'file');
  const label = part.filename ? `: ${part.filename}` : '';
  return { type: 'text', text: `[Attached ${mediaType}${label} already processed by model]` };
}

function toToolResultOutput(
  value: unknown,
): { type: 'text'; value: string } | { type: 'json'; value: unknown } {
  return typeof value === 'string' ? { type: 'text', value } : { type: 'json', value };
}

function findLastUserMessageIndex(conversation: ModelMessage[]): number {
  for (let i = conversation.length - 1; i >= 0; i--) {
    if (conversation[i]?.role === 'user') {
      return i;
    }
  }

  return -1;
}

function countToolResults(conversation: ModelMessage[]): number {
  let count = 0;
  for (const message of conversation) {
    if (message.role !== 'tool' || !Array.isArray(message.content)) {
      continue;
    }

    count += message.content.filter(isToolResultContentPart).length;
  }

  return count;
}

function countBrowserToolResults(conversation: ModelMessage[]): number {
  let count = 0;
  for (const message of conversation) {
    if (message.role !== 'tool' || !Array.isArray(message.content)) {
      continue;
    }

    count += message.content.filter(
      (part) => isToolResultContentPart(part) && part.toolName.startsWith('browser_'),
    ).length;
  }

  return count;
}

export function compactConversationForStep(
  conversation: ModelMessage[],
  options?: {
    preserveRecentToolResults?: number;
    compactToolResults?: boolean;
  },
): ModelMessage[] {
  const preserveRecentToolResults =
    options?.preserveRecentToolResults ?? PRESERVE_RECENT_TOOL_RESULTS;
  const compactToolResults = options?.compactToolResults ?? true;
  const lastUserMessageIndex = findLastUserMessageIndex(conversation);
  let remainingProtectedToolResults = preserveRecentToolResults;
  let remainingToolResults = countToolResults(conversation);
  let remainingBrowserToolResults = countBrowserToolResults(conversation);
  let changed = false;

  const compacted = conversation.map((message, messageIndex): ModelMessage => {
    if (
      message.role === 'user' &&
      Array.isArray(message.content) &&
      messageIndex !== lastUserMessageIndex
    ) {
      let contentChanged = false;
      const content = message.content.map((part) => {
        if (!isMediaContentPart(part)) {
          return part;
        }

        contentChanged = true;
        return stripMediaPart(part);
      });

      if (contentChanged) {
        changed = true;
        return { ...message, content } as ModelMessage;
      }
    }

    if (message.role !== 'tool' || !Array.isArray(message.content)) {
      return message;
    }

    let contentChanged = false;
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
            {
              toolName: part.toolName,
              output: part.output.value,
            },
            RECENT_BROWSER_TOOL_RESULT_BUDGET_TOKENS,
          );
          if (compactedOutput !== part.output.value) {
            contentChanged = true;
            return { ...part, output: toToolResultOutput(compactedOutput) };
          }
        }
        return part;
      }

      const compactedOutput = compactToolResultOutput({
        toolName: part.toolName,
        output: part.output.value,
      });
      if (compactedOutput === part.output.value) {
        return part;
      }

      contentChanged = true;
      return { ...part, output: toToolResultOutput(compactedOutput) };
    });

    if (contentChanged) {
      changed = true;
      return { ...message, content } as ModelMessage;
    }

    return message;
  });

  return changed ? compacted : conversation;
}
