export type STTCapability =
  | 'partials'
  | 'word_timestamps'
  | 'utterance_timestamps'
  | 'diarization'
  | 'native_vad'
  | 'language_detection'
  | 'keyterm_biasing';

export type CapabilitySupport = 'native' | 'fallback' | 'unsupported';

export type ModelCapabilities = Record<STTCapability, boolean>;

export type CapabilityRequest = Partial<Record<STTCapability, 'required' | 'preferred'>>;

export type CapabilityResolution = {
  satisfied: Record<STTCapability, CapabilitySupport>;
  degraded: STTCapability[];
};

export type AudioEncoding = 'f32le' | 'pcm_s16le';

export type AudioFormat = {
  encoding: AudioEncoding;
  sampleRateHz: number;
  channels: number;
};

export type AudioChunk = {
  samplesB64: string;
  sampleRateHz: number;
  numSamples: number;
  encoding: AudioEncoding;
};

export type AudioSource = 'mic' | 'speaker';

export type TranscriptWord = {
  text: string;
  startMs: number;
  endMs: number;
  speaker?: string | number;
};

export type TranscriptEvent = {
  id: string;
  kind: 'partial' | 'final';
  text: string;
  offsetMs: number;
  speaker?: string | number;
  words?: TranscriptWord[];
  language?: string;
};

export type STTUsage = {
  durationMs: number;
  audioInputTokens?: number;
  textOutputTokens?: number;
};

export type SttService = 'chat-input' | 'meeting-recording';

// WebSocket protocol messages (client -> server)
export type SttStartMessage = {
  type: 'start';
  sttSessionId: string;
  providerId: string;
  modelId: string;
  service: SttService;
  recordingId: string;
  capabilityRequest: CapabilityRequest;
  language?: string;
  keyterms?: string[];
  audioChunkConfig: {
    encoding: AudioEncoding;
    sampleRateHz: number;
  };
};

export type SttChunkMessage = {
  type: 'chunk';
  sttSessionId: string;
  source: AudioSource;
  samplesB64: string;
  sampleRateHz: number;
  numSamples: number;
};

export type SttCommitMessage = {
  type: 'commit';
  sttSessionId: string;
};

export type SttStopMessage = {
  type: 'stop';
  sttSessionId: string;
};

export type SttInboundMessage =
  | SttStartMessage
  | SttChunkMessage
  | SttCommitMessage
  | SttStopMessage;

// WebSocket protocol messages (server -> client)
export type SttReadyMessage = {
  type: 'ready';
  sttSessionId: string;
  capabilityResolution: CapabilityResolution;
};

export type SttTranscriptMessage = {
  type: 'transcript';
  sttSessionId: string;
  id: string;
  kind: 'partial' | 'final';
  text: string;
  offsetMs: number;
  speaker?: string | number;
  words?: TranscriptWord[];
  language?: string;
};

export type SttErrorMessage = {
  type: 'error';
  sttSessionId: string;
  message: string;
  code: string;
};

export type SttDoneMessage = {
  type: 'done';
  sttSessionId: string;
  costUsd: number;
  usage: STTUsage;
};

export type SttUnrecoverableMessage = {
  type: 'unrecoverable';
  sttSessionId: string;
  reason: string;
};

export type SttOutboundMessage =
  | SttReadyMessage
  | SttTranscriptMessage
  | SttErrorMessage
  | SttDoneMessage
  | SttUnrecoverableMessage;

export type SttModelSummary = {
  id: string;
  name: string;
  sampleRateHz: number;
};

export type SttProviderModels = {
  providerId: string;
  providerName: string;
  models: SttModelSummary[];
};
