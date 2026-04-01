/**
 * macOS-specific audio chunk normalization.
 *
 * On macOS, the native-audio-node library delivers audio in int16 format:
 * - MicrophoneRecorder: stereo int16 (2ch × 2B = 4B/frame)
 * - SystemAudioRecorder: mono int16 (1ch × 2B/sample)
 *
 * The recording writer expects mono float32 (4B/sample). This module detects
 * the incoming format per-chunk and converts to mono float32 before the data
 * is written to disk.
 *
 * This file is only imported on macOS (process.platform === 'darwin').
 */

const BYTES_PER_FLOAT32_SAMPLE = 4;
const BYTES_PER_INT16_SAMPLE = 2;

/**
 * Create a normalizer bound to a specific sample rate and chunk duration.
 * Returns a function that converts each incoming audio chunk to mono float32.
 */
export function createChunkNormalizer(sampleRate: number, chunkDurationMs: number) {
  const expectedSamplesPerChunk = (sampleRate * chunkDurationMs) / 1000;
  const expectedInt16Bytes = expectedSamplesPerChunk * BYTES_PER_INT16_SAMPLE;

  return function normalizeChunk(chunk: Buffer): Buffer {
    // Unambiguously mono int16: exactly half the float32 size
    if (chunk.length === expectedInt16Bytes) {
      return int16ToFloat32(chunk);
    }

    // Ambiguous size or larger: probe the content to determine format
    if (chunk.length % BYTES_PER_FLOAT32_SAMPLE === 0 && looksLikeFloat32(chunk)) {
      return chunk;
    }

    // Data is int16 (possibly stereo). Convert to mono float32.
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

/**
 * Convert an int16 PCM buffer to float32 PCM.
 * Each int16 sample (2 bytes, range -32768..32767) is converted to a float32
 * sample (4 bytes, range -1..1).
 */
function int16ToFloat32(input: Buffer): Buffer {
  const sampleCount = input.length / BYTES_PER_INT16_SAMPLE;
  const output = Buffer.alloc(sampleCount * BYTES_PER_FLOAT32_SAMPLE);
  for (let i = 0; i < sampleCount; i++) {
    const sample = input.readInt16LE(i * BYTES_PER_INT16_SAMPLE);
    output.writeFloatLE(sample / 32768, i * BYTES_PER_FLOAT32_SAMPLE);
  }
  return output;
}

/**
 * Check whether a buffer contains float32 PCM audio rather than int16 data.
 *
 * Real float32 audio samples are finite and within [-1, 1] (or slightly beyond
 * for headroom). Int16 data misread as float32 produces NaN, infinity, or
 * finite values far outside the audio range (e.g. 1e8). We check that sampled
 * values are finite and within [-2, 2] to reliably distinguish the two.
 */
function looksLikeFloat32(buf: Buffer): boolean {
  const sampleCount = buf.length / BYTES_PER_FLOAT32_SAMPLE;
  if (sampleCount < 1) return false;

  // Sample up to 8 evenly-spaced float32 values
  const step = Math.max(1, Math.floor(sampleCount / 8));

  for (let i = 0; i < sampleCount && i / step < 8; i += step) {
    const val = buf.readFloatLE(i * BYTES_PER_FLOAT32_SAMPLE);
    if (!Number.isFinite(val) || val < -2 || val > 2) {
      return false;
    }
  }

  return true;
}

/**
 * Convert a stereo int16 PCM buffer to mono float32 by averaging L+R channels.
 */
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
