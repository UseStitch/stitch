import type { ModelSummary, ProviderModels } from '@/lib/queries/providers';

type ProviderModelSelection = { providerId: string; modelId: string };

type ProviderModelOption = {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  modelSummary: ModelSummary;
};

export function buildProviderModelOptions(providerModels: ProviderModels[]): ProviderModelOption[] {
  return providerModels.flatMap((provider) =>
    provider.models.map((model) => ({
      providerId: provider.providerId,
      providerName: provider.providerName,
      modelId: model.id,
      modelName: model.name,
      modelSummary: model,
    })),
  );
}

export function filterProviderModels(providerModels: ProviderModels[], query: string): ProviderModels[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return providerModels;
  const lowered = trimmedQuery.toLowerCase();

  return providerModels.reduce<ProviderModels[]>((acc, provider) => {
    const models = provider.models.filter(
      (model) => model.name.toLowerCase().includes(lowered) || provider.providerName.toLowerCase().includes(lowered),
    );
    if (models.length > 0) acc.push({ ...provider, models });
    return acc;
  }, []);
}

export function findProviderModelOption(
  options: ProviderModelOption[],
  selected: ProviderModelSelection | null,
): ProviderModelOption | null {
  if (!selected) return null;

  return (
    options.find((option) => option.providerId === selected.providerId && option.modelId === selected.modelId) ?? null
  );
}
