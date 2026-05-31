export type TranscriptCallback = (text: string) => void;

export type ErrorCallback = (error: Error) => void;

/**
 * Usage metadata streamed from the provider during a live session.
 * Mirrors Gemini's `usageMetadata` structure — token counts broken down by modality.
 */
export type LiveTranscriptionUsage = {
  promptTokenCount?: number;
  responseTokenCount?: number;
  totalTokenCount?: number;
  promptTokensDetails?: Array<{ modality: string; tokenCount: number }>;
  responseTokensDetails?: Array<{ modality: string; tokenCount: number }>;
};

export type UsageCallback = (usage: LiveTranscriptionUsage) => void;

export type LiveTranscriptionConnectionConfig = {
  apiKey: string;
  endpoint: string;
  modelId: string;
  sampleRateHz: number;
};

export type LiveTranscriptionConnection = {
  sendAudio: (base64Pcm: string) => void;
  close: () => Promise<void>;
  onTranscript: (cb: TranscriptCallback) => void;
  onUsage: (cb: UsageCallback) => void;
  onError: (cb: ErrorCallback) => void;
};

export type LiveTranscriptionProvider = {
  connect: (config: LiveTranscriptionConnectionConfig) => Promise<LiveTranscriptionConnection>;
};
