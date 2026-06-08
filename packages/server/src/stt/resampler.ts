import type { AudioChunk, AudioFormat } from '@stitch/shared/stt/types';

export type AudioResampler = {
  convert(input: AudioChunk, target: AudioFormat): AudioChunk;
};

/**
 * Decodes base64 audio to a Float64Array of normalized samples [-1, 1].
 */
function decodeToFloat64(samplesB64: string, encoding: 'f32le' | 'pcm_s16le'): Float64Array {
  const raw = Buffer.from(samplesB64, 'base64');

  if (encoding === 'f32le') {
    const count = raw.byteLength / 4;
    const out = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = raw.readFloatLE(i * 4);
    }
    return out;
  }

  // pcm_s16le
  const count = raw.byteLength / 2;
  const out = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = raw.readInt16LE(i * 2) / 32768;
  }
  return out;
}

/**
 * Encodes normalized float samples to the target encoding as base64.
 */
function encodeFromFloat64(samples: Float64Array, encoding: 'f32le' | 'pcm_s16le'): string {
  if (encoding === 'f32le') {
    const buf = Buffer.alloc(samples.length * 4);
    for (let i = 0; i < samples.length; i++) {
      buf.writeFloatLE(samples[i], i * 4);
    }
    return buf.toString('base64');
  }

  // pcm_s16le
  const buf = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? clamped * 32768 : clamped * 32767;
    buf.writeInt16LE(Math.round(int16), i * 2);
  }
  return buf.toString('base64');
}

/**
 * Linear interpolation resampler. Sufficient for speech audio where
 * anti-aliasing artifacts are not critical.
 */
function resampleLinear(samples: Float64Array, fromRate: number, toRate: number): Float64Array {
  if (fromRate === toRate) return samples;

  const ratio = toRate / fromRate;
  const outLength = Math.round(samples.length * ratio);
  const out = new Float64Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcIdx = i / ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, samples.length - 1);
    const frac = srcIdx - lo;
    out[i] = samples[lo] * (1 - frac) + samples[hi] * frac;
  }

  return out;
}

export function createDefaultResampler(): AudioResampler {
  return {
    convert(input: AudioChunk, target: AudioFormat): AudioChunk {
      // Fast path: no conversion needed
      if (input.encoding === target.encoding && input.sampleRateHz === target.sampleRateHz) {
        return input;
      }

      // Decode to normalized float64
      let samples = decodeToFloat64(input.samplesB64, input.encoding);

      // Resample if needed
      if (input.sampleRateHz !== target.sampleRateHz) {
        samples = resampleLinear(samples, input.sampleRateHz, target.sampleRateHz);
      }

      // Encode to target format
      const samplesB64 = encodeFromFloat64(samples, target.encoding);

      return {
        samplesB64,
        sampleRateHz: target.sampleRateHz,
        numSamples: samples.length,
        encoding: target.encoding,
      };
    },
  };
}
