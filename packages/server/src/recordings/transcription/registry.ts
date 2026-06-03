import type { LiveTranscriptionProvider } from '@/recordings/transcription/provider-iface.js';
import { geminiProvider } from '@/recordings/transcription/providers/gemini.js';

const PROVIDERS: Record<string, LiveTranscriptionProvider> = {
  google: geminiProvider,
};

export function getTranscriptionProvider(providerId: string): LiveTranscriptionProvider | null {
  return PROVIDERS[providerId] ?? null;
}
