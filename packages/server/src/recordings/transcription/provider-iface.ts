export type TranscriptCallback = (text: string) => void;

export type ErrorCallback = (error: Error) => void;

export type LiveTranscriptionConnectionConfig = {
  apiKey: string;
  endpoint: string;
  modelId: string;
  sampleRateHz: number;
};

export type LiveTranscriptionConnection = {
  sendAudio: (base64Pcm: string) => void;
  close: () => void;
  onTranscript: (cb: TranscriptCallback) => void;
  onError: (cb: ErrorCallback) => void;
};

export type LiveTranscriptionProvider = {
  connect: (config: LiveTranscriptionConnectionConfig) => Promise<LiveTranscriptionConnection>;
};
