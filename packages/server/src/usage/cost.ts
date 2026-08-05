import * as EmbeddingModels from '@/models/embedding/service.js';
import * as Models from '@/models/llm/registry.js';
import { normalizeUsage } from '@/utils/usage.js';
import type { LanguageModelUsage } from 'ai';

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
  providers?: Awaited<ReturnType<typeof Models.get>>;
}): Promise<number> {
  const providers = input.providers ?? (await Models.get());
  const model = providers[input.providerId]?.models[input.modelId];
  const modelCost = model?.cost;
  if (!modelCost) {
    return 0;
  }

  const effectiveCost = getEffectiveCostModel(modelCost, input.usage);
  const usage = normalizeUsage(input.usage);

  const costUsd =
    (usage.noCacheTokens * effectiveCost.input +
      usage.outputTokens * effectiveCost.output +
      usage.cacheReadTokens * (effectiveCost.cache_read ?? effectiveCost.input) +
      usage.cacheWriteTokens * (effectiveCost.cache_write ?? effectiveCost.input)) /
    TOKENS_PER_MILLION;

  return Number.isFinite(costUsd) ? costUsd : 0;
}

export async function calculateEmbeddingCostUsd(input: {
  providerId: string;
  modelId: string;
  tokens: number;
}): Promise<number> {
  const providers = await EmbeddingModels.getEmbeddingModels();
  const model = providers[input.providerId]?.models[input.modelId];
  if (!model) return 0;

  const costUsd = (input.tokens * model.cost.input) / TOKENS_PER_MILLION;
  return Number.isFinite(costUsd) ? costUsd : 0;
}
