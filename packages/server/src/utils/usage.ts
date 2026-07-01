import type { LanguageModelUsage } from 'ai';

type NormalizedUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  noCacheTokens: number;
  totalTokens: number;
};

function safe(value: number | null | undefined): number {
  if (typeof value !== 'number') {
    return 0;
  }

  return Number.isFinite(value) ? value : 0;
}

export function normalizeUsage(usage: LanguageModelUsage | null | undefined): NormalizedUsage {
  const inputTokens = safe(usage?.inputTokens);
  const outputTokens = safe(usage?.outputTokens);
  const reasoningTokens = safe(usage?.outputTokenDetails?.reasoningTokens);
  const cacheReadTokens = safe(usage?.inputTokenDetails?.cacheReadTokens);
  const cacheWriteTokens = safe(usage?.inputTokenDetails?.cacheWriteTokens);
  const noCacheTokens =
    usage?.inputTokenDetails?.noCacheTokens !== undefined
      ? safe(usage.inputTokenDetails.noCacheTokens)
      : Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  const providedTotalTokens = safe(usage?.totalTokens);
  const totalTokens =
    providedTotalTokens > 0
      ? providedTotalTokens
      : inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens;

  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    noCacheTokens,
    totalTokens,
  };
}

export function addUsage(a: LanguageModelUsage, b: LanguageModelUsage): LanguageModelUsage {
  const usageA = normalizeUsage(a);
  const usageB = normalizeUsage(b);

  return {
    inputTokens: usageA.inputTokens + usageB.inputTokens,
    outputTokens: usageA.outputTokens + usageB.outputTokens,
    totalTokens: usageA.totalTokens + usageB.totalTokens,
    inputTokenDetails: {
      noCacheTokens: usageA.noCacheTokens + usageB.noCacheTokens,
      cacheReadTokens: usageA.cacheReadTokens + usageB.cacheReadTokens,
      cacheWriteTokens: usageA.cacheWriteTokens + usageB.cacheWriteTokens,
    },
    outputTokenDetails: {
      textTokens: safe(a.outputTokenDetails?.textTokens) + safe(b.outputTokenDetails?.textTokens),
      reasoningTokens: usageA.reasoningTokens + usageB.reasoningTokens,
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
