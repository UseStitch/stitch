import elevenlabsRegistry from '@stitch/registry-stt/models/elevenlabs.json';
import openaiRegistry from '@stitch/registry-stt/models/openai.json';

import type { ModelDescriptor } from '@/stt/types.js';

type RegistryModel = {
  modelId: string;
  displayName: string;
  capabilities: Record<string, boolean>;
  inputFormat: { encoding: string; sampleRateHz: number; channels: number };
  partialStrategy: string;
  buffer: {
    maxChunkBytes: number;
    flushIntervalMs: number;
    maxBufferedMs: number;
    paceRealtime: boolean;
  };
  reconnect: { enabled: boolean; maxRetries: number; backoffMs: number; rotateBeforeMs?: number };
  pricing:
    | { type: 'token'; perMillionTokens: { audioInput: number; textOutput: number } }
    | { type: 'duration'; perMinuteUsd: number };
};

type RegistryProvider = {
  providerId: string;
  providerName: string;
  models: RegistryModel[];
};

type CatalogEntry = {
  providerId: string;
  models: ModelDescriptor[];
};

const registries = [openaiRegistry, elevenlabsRegistry] as unknown as RegistryProvider[];

export const MODEL_CATALOG: CatalogEntry[] = registries.map((registry) => ({
  providerId: registry.providerId,
  models: registry.models as unknown as ModelDescriptor[],
}));

export function getModelDescriptor(providerId: string, modelId: string): ModelDescriptor | null {
  const entry = MODEL_CATALOG.find((e) => e.providerId === providerId);
  if (!entry) return null;
  return entry.models.find((m) => m.modelId === modelId) ?? null;
}
