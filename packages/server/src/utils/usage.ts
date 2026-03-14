import type { LanguageModelUsage } from 'ai';

export function addUsage(a: LanguageModelUsage, b: LanguageModelUsage): LanguageModelUsage {
  return {
    inputTokens: (a.inputTokens ?? 0) + (b.inputTokens ?? 0),
    outputTokens: (a.outputTokens ?? 0) + (b.outputTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0),
    inputTokenDetails: {
      noCacheTokens:
        (a.inputTokenDetails.noCacheTokens ?? 0) + (b.inputTokenDetails.noCacheTokens ?? 0),
      cacheReadTokens:
        (a.inputTokenDetails.cacheReadTokens ?? 0) + (b.inputTokenDetails.cacheReadTokens ?? 0),
      cacheWriteTokens:
        (a.inputTokenDetails.cacheWriteTokens ?? 0) + (b.inputTokenDetails.cacheWriteTokens ?? 0),
    },
    outputTokenDetails: {
      textTokens: (a.outputTokenDetails.textTokens ?? 0) + (b.outputTokenDetails.textTokens ?? 0),
      reasoningTokens:
        (a.outputTokenDetails.reasoningTokens ?? 0) + (b.outputTokenDetails.reasoningTokens ?? 0),
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
