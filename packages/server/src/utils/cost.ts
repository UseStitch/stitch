import type { LanguageModelUsage } from 'ai';

import * as Models from '@/provider/models.js';

const TOKENS_PER_MILLION = 1_000_000;
const CONTEXT_200K_THRESHOLD = 200_000;

type ModelCost = NonNullable<Models.RawModel['cost']>;

function getEffectiveCostModel(cost: ModelCost, usage: LanguageModelUsage): Omit<ModelCost, 'context_over_200k'> {
  if ((usage.inputTokens ?? 0) > CONTEXT_200K_THRESHOLD && cost.context_over_200k) {
    return cost.context_over_200k;
  }
  return cost;
}

export async function calculateMessageCostUsd(input: {
  providerId: string;
  modelId: string;
  usage: LanguageModelUsage;
}): Promise<number | null> {
  const providers = await Models.get();
  const model = providers[input.providerId]?.models[input.modelId];
  const modelCost = model?.cost;
  if (!modelCost) {
    return null;
  }

  const effectiveCost = getEffectiveCostModel(modelCost, input.usage);
  const inputTokens = input.usage.inputTokens ?? 0;
  const outputTokens = input.usage.outputTokens ?? 0;
  const cacheReadTokens = input.usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWriteTokens = input.usage.inputTokenDetails?.cacheWriteTokens ?? 0;
  const noCacheTokens =
    input.usage.inputTokenDetails?.noCacheTokens ??
    Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);

  const costUsd =
    (noCacheTokens * effectiveCost.input +
      outputTokens * effectiveCost.output +
      cacheReadTokens * (effectiveCost.cache_read ?? effectiveCost.input) +
      cacheWriteTokens * (effectiveCost.cache_write ?? effectiveCost.input)) /
    TOKENS_PER_MILLION;

  return Number.isFinite(costUsd) ? costUsd : null;
}
