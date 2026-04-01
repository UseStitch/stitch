import { MacRecordingWriter } from './mac-recording-writer.js';
import { WindowsRecordingWriter } from './windows-recording-writer.js';

import type {
  RecordingErrorCallback,
  RecordingHandle,
  RecordingResult,
  RecordingWriterOptions,
} from './platform-recording-writer.js';

type RecordingWriterImpl = {
  start(recordingId: string, onError?: RecordingErrorCallback): Promise<RecordingHandle>;
  stop(handle: RecordingHandle): Promise<RecordingResult>;
  discard(handle: RecordingHandle): Promise<void>;
};

export class RecordingWriter {
  private readonly impl: RecordingWriterImpl;

  constructor(baseDir: string, options?: RecordingWriterOptions) {
    if (process.platform === 'darwin') {
      this.impl = new MacRecordingWriter(baseDir, options);
      return;
    }

    if (process.platform === 'win32') {
      this.impl = new WindowsRecordingWriter(baseDir, options);
      return;
    }

    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  async start(recordingId: string, onError?: RecordingErrorCallback): Promise<RecordingHandle> {
    return this.impl.start(recordingId, onError);
  }

  async stop(handle: RecordingHandle): Promise<RecordingResult> {
    return this.impl.stop(handle);
  }

  async discard(handle: RecordingHandle): Promise<void> {
    return this.impl.discard(handle);
  }
}

export type {
  RecordingErrorCallback,
  RecordingFile,
  RecordingHandle,
  RecordingResult,
  RecordingWriterOptions,
} from './platform-recording-writer.js';
