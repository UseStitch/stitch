import type { ProviderModels } from '@/lib/queries/providers';

export function encodeModelValue(providerId: string, modelId: string): string {
  return JSON.stringify({ providerId, modelId });
}

export function decodeModelValue(value: string): { providerId: string; modelId: string } | null {
  try {
    const parsed = JSON.parse(value) as { providerId?: string; modelId?: string };
    if (parsed.providerId && parsed.modelId) {
      return { providerId: parsed.providerId, modelId: parsed.modelId };
    }
    return null;
  } catch {
    return null;
  }
}

export function buildModelLabel(
  providerModels: ProviderModels[],
  providerId: string,
  modelId: string,
): string {
  for (const provider of providerModels) {
    if (provider.providerId !== providerId) continue;
    const model = provider.models.find((entry) => entry.id === modelId);
    if (model) return `${provider.providerName} / ${model.name}`;
  }

  return `${providerId} / ${modelId}`;
}
