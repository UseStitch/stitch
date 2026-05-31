import { getTranscriptionProvidersFromRegistry } from '@/llm/provider/transcription-registry.js';
import type { TranscriptionProvider } from '@/llm/provider/transcription-schema.js';

export async function getTranscriptionModels(): Promise<TranscriptionProvider[]> {
  return await getTranscriptionProvidersFromRegistry();
}
