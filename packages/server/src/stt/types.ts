export type BufferConfig = {
  maxChunkBytes: number;
  flushIntervalMs: number;
  maxBufferedMs: number;
  paceRealtime: boolean;
};

export type ReconnectConfig = {
  enabled: boolean;
  maxRetries: number;
  backoffMs: number;
  maxBackoffMs?: number;
  rotateBeforeMs?: number;
  pingIntervalMs?: number;
  pongTimeoutMs?: number;
  keepAliveMessage?: string;
};

export type PartialStrategy = 'cumulative' | 'incremental';

export type STTPricing =
  | { type: 'token'; perMillionTokens: { audioInput: number; textOutput: number } }
  | { type: 'duration'; perMinuteUsd: number };

export type ModelDescriptor = {
  modelId: string;
  displayName: string;
  capabilities: Record<import('@stitch/shared/stt/types').STTCapability, boolean>;
  inputFormat: import('@stitch/shared/stt/types').AudioFormat;
  partialStrategy: PartialStrategy;
  buffer: BufferConfig;
  reconnect: ReconnectConfig;
  pricing: STTPricing;
};

export type ProviderAuth = { kind: 'apiKey'; key: string } | { kind: 'none' };

export type CommitStrategy = 'native_vad' | 'manual';

export type STTConnectionConfig = {
  modelId: string;
  auth: ProviderAuth;
  inputFormat: import('@stitch/shared/stt/types').AudioFormat;
  language?: string;
  capabilities: import('@stitch/shared/stt/types').CapabilityResolution;
  commitStrategy: CommitStrategy;
  partialStrategy: PartialStrategy;
  buffer: BufferConfig;
  reconnect: ReconnectConfig;
  keyterms?: string[];
  captureStartMs: number;
};
