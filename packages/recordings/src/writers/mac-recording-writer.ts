import { createChunkNormalizer } from './mac-audio-normalizer.js';
import { PlatformRecordingWriter } from './platform-recording-writer.js';

import type { RecordingWriterOptions } from './platform-recording-writer.js';

const SAMPLE_RATE = 16000;
const CHUNK_DURATION_MS = 100;

export class MacRecordingWriter extends PlatformRecordingWriter {
  private readonly normalizer = createChunkNormalizer(SAMPLE_RATE, CHUNK_DURATION_MS);

  constructor(baseDir: string, options?: RecordingWriterOptions) {
    super(baseDir, options);
  }

  protected override normalizeChunk(chunk: Buffer): Buffer {
    return this.normalizer(chunk);
  }
}
