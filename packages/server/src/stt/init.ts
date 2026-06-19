import { assemblyaiAdapter } from '@/stt/adapters/assemblyai.js';
import { elevenlabsAdapter } from '@/stt/adapters/elevenlabs.js';
import { openaiAdapter } from '@/stt/adapters/openai.js';
import { registerAdapter } from '@/stt/registry.js';

export function initSttAdapters(): void {
  registerAdapter(openaiAdapter);
  registerAdapter(elevenlabsAdapter);
  registerAdapter(assemblyaiAdapter);
}
