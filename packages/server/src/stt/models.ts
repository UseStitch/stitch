import { getSttProvidersFromRegistry } from '@/stt/stt-registry.js';
import type { SttModel, SttProvider } from '@/stt/stt-schema.js';
import type { ModelDescriptor } from '@/stt/types.js';

type CatalogEntry = {
  providerId: string;
  models: ModelDescriptor[];
};

function toModelDescriptor(model: SttModel): ModelDescriptor {
  return model as unknown as ModelDescriptor;
}

function toCatalogEntry(provider: SttProvider): CatalogEntry {
  return {
    providerId: provider.providerId,
    models: provider.models.map(toModelDescriptor),
  };
}

export async function getModelCatalog(): Promise<CatalogEntry[]> {
  const providers = await getSttProvidersFromRegistry();
  return providers.map(toCatalogEntry);
}

export async function getModelDescriptor(
  providerId: string,
  modelId: string,
): Promise<ModelDescriptor | null> {
  const catalog = await getModelCatalog();
  const entry = catalog.find((e) => e.providerId === providerId);
  if (!entry) return null;
  return entry.models.find((m) => m.modelId === modelId) ?? null;
}
