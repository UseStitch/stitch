import { elevenlabsAdapter } from '@/stt/adapters/elevenlabs.js';
import { googleChirpAdapter } from '@/stt/adapters/google-chirp.js';
import { openaiAdapter } from '@/stt/adapters/openai.js';
import { registerAdapter } from '@/stt/registry.js';

export function initSttAdapters(): void {
  registerAdapter(openaiAdapter);
  registerAdapter(elevenlabsAdapter);
  registerAdapter(googleChirpAdapter);
}
