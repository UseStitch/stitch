import { PATHS } from '@/lib/paths.js';
import { createRegistryCache } from '@/lib/registry-cache.js';
import {
  TranscriptionRegistryPayloadSchema,
  type TranscriptionProvider,
  type TranscriptionRegistryPayload,
} from '@/llm/provider/transcription-schema.js';

const DEFAULT_TRANSCRIPTION_REGISTRY_URL = 'https://usestitch.ai/live-transcription-models.json';

function getRegistryUrl(): string {
  return (
    process.env['STITCH_TRANSCRIPTION_REGISTRY_URL']?.trim() || DEFAULT_TRANSCRIPTION_REGISTRY_URL
  );
}

const transcriptionRegistryCache = createRegistryCache<TranscriptionRegistryPayload>({
  cacheFilePath: PATHS.filePaths.transcriptionModelsRegistry,
  get url() {
    return getRegistryUrl();
  },
  parse: (raw) => TranscriptionRegistryPayloadSchema.parse(raw),
});

export async function getTranscriptionProvidersFromRegistry(
  fetchImpl = fetch,
): Promise<TranscriptionProvider[]> {
  const payload = await transcriptionRegistryCache.get(fetchImpl);
  return payload.providers;
}
