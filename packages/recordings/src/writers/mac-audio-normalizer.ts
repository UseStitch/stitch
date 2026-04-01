const BYTES_PER_FLOAT32_SAMPLE = 4;
const BYTES_PER_INT16_SAMPLE = 2;

export function createChunkNormalizer(sampleRate: number, chunkDurationMs: number) {
  const expectedSamplesPerChunk = (sampleRate * chunkDurationMs) / 1000;
  const expectedInt16Bytes = expectedSamplesPerChunk * BYTES_PER_INT16_SAMPLE;

  return function normalizeChunk(chunk: Buffer): Buffer {
    if (chunk.length === expectedInt16Bytes) {
      return int16ToFloat32(chunk);
    }

    if (chunk.length % BYTES_PER_FLOAT32_SAMPLE === 0 && looksLikeFloat32(chunk)) {
      return chunk;
    }

    if (chunk.length % BYTES_PER_INT16_SAMPLE === 0) {
      const channelCount = chunk.length / (expectedSamplesPerChunk * BYTES_PER_INT16_SAMPLE);
      if (channelCount === 2) {
        return stereoInt16ToMonoFloat32(chunk);
      }
      return int16ToFloat32(chunk);
    }

    return chunk;
  };
}

function int16ToFloat32(input: Buffer): Buffer {
  const sampleCount = input.length / BYTES_PER_INT16_SAMPLE;
  const output = Buffer.alloc(sampleCount * BYTES_PER_FLOAT32_SAMPLE);
  for (let i = 0; i < sampleCount; i++) {
    const sample = input.readInt16LE(i * BYTES_PER_INT16_SAMPLE);
    output.writeFloatLE(sample / 32768, i * BYTES_PER_FLOAT32_SAMPLE);
  }
  return output;
}

function looksLikeFloat32(buf: Buffer): boolean {
  const sampleCount = buf.length / BYTES_PER_FLOAT32_SAMPLE;
  if (sampleCount < 1) return false;

  const step = Math.max(1, Math.floor(sampleCount / 8));
  for (let i = 0; i < sampleCount && i / step < 8; i += step) {
    const val = buf.readFloatLE(i * BYTES_PER_FLOAT32_SAMPLE);
    if (!Number.isFinite(val) || val < -2 || val > 2) {
      return false;
    }
  }

  return true;
}

function stereoInt16ToMonoFloat32(input: Buffer): Buffer {
  const frameCount = input.length / (BYTES_PER_INT16_SAMPLE * 2);
  const output = Buffer.alloc(frameCount * BYTES_PER_FLOAT32_SAMPLE);
  for (let i = 0; i < frameCount; i++) {
    const left = input.readInt16LE(i * 4);
    const right = input.readInt16LE(i * 4 + 2);
    const mono = (left + right) / 2 / 32768;
    output.writeFloatLE(mono, i * BYTES_PER_FLOAT32_SAMPLE);
  }
  return output;
}
