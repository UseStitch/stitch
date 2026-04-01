import { PlatformRecordingWriter } from './platform-recording-writer.js';

import type { RecordingWriterOptions } from './platform-recording-writer.js';

export class WindowsRecordingWriter extends PlatformRecordingWriter {
  constructor(baseDir: string, options?: RecordingWriterOptions) {
    super(baseDir, options);
  }

  protected override normalizeChunk(chunk: Buffer): Buffer {
    return chunk;
  }
}
