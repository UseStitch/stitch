declare module 'native-audio-node' {
  interface NativeProcessInfo {
    pid: number;
    name: string;
    bundleId: string;
  }

  interface RecorderDataChunk {
    data: Buffer;
  }

  interface MicrophoneActivityMonitorOptions {
    fallbackPollInterval?: number;
  }

  interface RecorderOptions {
    sampleRate: number;
    chunkDurationMs: number;
  }

  interface SystemAudioRecorderOptions extends RecorderOptions {
    emitSilence?: boolean;
  }

  type ChangeListener = () => void;
  type ErrorListener = (error: Error) => void;
  type DataListener = (chunk: RecorderDataChunk) => void;

  export class MicrophoneActivityMonitor {
    constructor(options?: MicrophoneActivityMonitorOptions);
    on(event: 'change', listener: ChangeListener): this;
    on(event: 'error', listener: ErrorListener): this;
    off(event: 'change', listener: ChangeListener): this;
    off(event: 'error', listener: ErrorListener): this;
    start(): void;
    stop(): void;
    getActiveProcesses(): NativeProcessInfo[];
  }

  export class MicrophoneRecorder {
    constructor(options: RecorderOptions);
    on(event: 'data', listener: DataListener): this;
    on(event: 'error', listener: ErrorListener): this;
    start(): Promise<void>;
    stop(): Promise<void>;
  }

  export class SystemAudioRecorder {
    constructor(options: SystemAudioRecorderOptions);
    on(event: 'data', listener: DataListener): this;
    on(event: 'error', listener: ErrorListener): this;
    start(): Promise<void>;
    stop(): Promise<void>;
  }
}
