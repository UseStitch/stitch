import { internalBus } from '@/lib/internal-bus.js';
import { applyChatTitle, applyRecordingTitle } from '@/title-generation/service.js';

export function registerTitleGenerationAdapter(): void {
  internalBus.on('title.generation.chat.requested', (event) => applyChatTitle(event));

  internalBus.on('title.generation.recording_analysis.requested', (event) => applyRecordingTitle(event));
}
