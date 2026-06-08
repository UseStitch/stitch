import type { AudioChunk, TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import type { ModelDescriptor, STTConnectionConfig } from '@/stt/types.js';

export type STTConnection = {
  sendAudio(chunk: AudioChunk): void;
  commit(): void;
  close(): Promise<void>;
  onTranscript(cb: (e: TranscriptEvent) => void): void;
  onUsage(cb: (u: STTUsage) => void): void;
  onError(cb: (err: Error) => void): void;
  onClose(cb: () => void): void;
};

export type STTAdapter = {
  readonly providerId: string;
  readonly models: ModelDescriptor[];
  connect(config: STTConnectionConfig): Promise<STTConnection>;
};
