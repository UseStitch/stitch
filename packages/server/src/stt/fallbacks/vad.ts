import type { AudioChunk } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'stt.fallback.vad' });

type VadConfig = {
  /** RMS energy threshold for speech detection (0-1 range). */
  energyThreshold: number;
  /** Silence duration (ms) before triggering a commit. */
  silenceDurationMs: number;
  /** Minimum speech duration (ms) before allowing a commit. */
  minSpeechDurationMs: number;
};

const DEFAULT_VAD_CONFIG: VadConfig = { energyThreshold: 0.02, silenceDurationMs: 800, minSpeechDurationMs: 250 };

export type VadFallback = {
  /** Feed audio and get back whether a commit should be triggered. */
  processChunk(chunk: AudioChunk): boolean;
  /** Reset the VAD state. */
  reset(): void;
};

/**
 * Creates a server-side VAD fallback using energy/silence segmentation.
 * Returns true from processChunk when a turn boundary is detected (silence after speech).
 */
export function createVadFallback(config: Partial<VadConfig> = {}): VadFallback {
  const cfg = { ...DEFAULT_VAD_CONFIG, ...config };

  let isSpeaking = false;
  let speechStartMs = 0;
  let silenceStartMs = 0;

  function computeRmsEnergy(chunk: AudioChunk): number {
    const raw = Buffer.from(chunk.samplesB64, 'base64');

    let sumSquares = 0;
    let sampleCount = 0;

    if (chunk.encoding === 'f32le') {
      sampleCount = raw.byteLength / 4;
      for (let i = 0; i < sampleCount; i++) {
        const sample = raw.readFloatLE(i * 4);
        sumSquares += sample * sample;
      }
    } else {
      // pcm_s16le
      sampleCount = raw.byteLength / 2;
      for (let i = 0; i < sampleCount; i++) {
        const sample = raw.readInt16LE(i * 2) / 32768;
        sumSquares += sample * sample;
      }
    }

    return sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
  }

  function processChunk(chunk: AudioChunk): boolean {
    const energy = computeRmsEnergy(chunk);
    const now = Date.now();

    if (energy >= cfg.energyThreshold) {
      // Speech detected
      if (!isSpeaking) {
        isSpeaking = true;
        speechStartMs = now;
        log.debug('speech started');
      }
      silenceStartMs = 0;
      return false;
    }

    // Silence detected
    if (!isSpeaking) return false;

    if (silenceStartMs === 0) {
      silenceStartMs = now;
    }

    const silenceDuration = now - silenceStartMs;
    const speechDuration = silenceStartMs - speechStartMs;

    if (silenceDuration >= cfg.silenceDurationMs && speechDuration >= cfg.minSpeechDurationMs) {
      // Turn boundary detected
      isSpeaking = false;
      silenceStartMs = 0;
      speechStartMs = 0;
      log.debug({ speechDuration, silenceDuration }, 'turn boundary detected');
      return true;
    }

    return false;
  }

  function reset(): void {
    isSpeaking = false;
    speechStartMs = 0;
    silenceStartMs = 0;
  }

  return { processChunk, reset };
}
