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
  onUnrecoverable(cb: (reason: string) => void): void;
};

/**
 * Minimal transport that a raw WebSocket connection must provide.
 * The base adapter wraps this with buffering, reconnection, and event dispatch.
 */
export type STTTransport = {
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
  models(): Promise<ModelDescriptor[]>;
  connect(config: STTConnectionConfig): Promise<STTConnection>;
};
