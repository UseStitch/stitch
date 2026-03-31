import type { LanguageModelUsage } from 'ai';

function safe(value: number | null | undefined): number {
  if (typeof value !== 'number') {
    return 0;
  }

  return Number.isFinite(value) ? value : 0;
}

export function addUsage(a: LanguageModelUsage, b: LanguageModelUsage): LanguageModelUsage {
  return {
    inputTokens: safe(a.inputTokens) + safe(b.inputTokens),
    outputTokens: safe(a.outputTokens) + safe(b.outputTokens),
    totalTokens: safe(a.totalTokens) + safe(b.totalTokens),
    inputTokenDetails: {
      noCacheTokens: safe(a.inputTokenDetails?.noCacheTokens) + safe(b.inputTokenDetails?.noCacheTokens),
      cacheReadTokens:
        safe(a.inputTokenDetails?.cacheReadTokens) + safe(b.inputTokenDetails?.cacheReadTokens),
      cacheWriteTokens:
        safe(a.inputTokenDetails?.cacheWriteTokens) + safe(b.inputTokenDetails?.cacheWriteTokens),
    },
    outputTokenDetails: {
      textTokens: safe(a.outputTokenDetails?.textTokens) + safe(b.outputTokenDetails?.textTokens),
      reasoningTokens:
        safe(a.outputTokenDetails?.reasoningTokens) + safe(b.outputTokenDetails?.reasoningTokens),
    },
  };
}

export const ZERO_USAGE: LanguageModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
};
