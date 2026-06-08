import { PATHS } from '@/lib/paths.js';
import { createRegistryCache } from '@/lib/registry-cache.js';
import {
  SttRegistryPayloadSchema,
  type SttProvider,
  type SttRegistryPayload,
} from '@/stt/stt-schema.js';

const DEFAULT_STT_REGISTRY_URL = 'https://usestitch.ai/stt-models.json';

function getRegistryUrl(): string {
  return process.env['STITCH_STT_REGISTRY_URL']?.trim() || DEFAULT_STT_REGISTRY_URL;
}

const sttRegistryCache = createRegistryCache<SttRegistryPayload>({
  cacheFilePath: PATHS.filePaths.sttModelsRegistry,
  get url() {
    return getRegistryUrl();
  },
  parse: (raw) => SttRegistryPayloadSchema.parse(raw),
});

export async function getSttProvidersFromRegistry(fetchImpl = fetch): Promise<SttProvider[]> {
  const payload = await sttRegistryCache.get(fetchImpl);
  return payload.providers;
}

export async function refresh(fetchImpl = fetch): Promise<void> {
  await sttRegistryCache.refresh(fetchImpl);
}
