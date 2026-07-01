import type { AudioFormat, CapabilityResolution, STTCapability } from '@stitch/shared/stt/types';

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
  capabilities: Record<STTCapability, boolean>;
  inputFormat: AudioFormat;
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
  inputFormat: AudioFormat;
  language?: string;
  capabilities: CapabilityResolution;
  commitStrategy: CommitStrategy;
  partialStrategy: PartialStrategy;
  buffer: BufferConfig;
  reconnect: ReconnectConfig;
  keyterms?: string[];
  captureStartMs: number;
};
