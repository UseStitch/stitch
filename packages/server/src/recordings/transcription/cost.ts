import type { TranscriptionPricing } from '@/llm/provider/transcription-schema.js';
import type { LiveTranscriptionUsage } from '@/recordings/transcription/provider-iface.js';

const TOKENS_PER_MILLION = 1_000_000;

/**
 * Calculate USD cost from provider usage metadata and registry pricing.
 * Supports both token-based (Gemini) and duration-based (OpenAI) pricing.
 */
export function calculateTranscriptionCostUsd(
  usage: LiveTranscriptionUsage,
  pricing: TranscriptionPricing,
): number {
  if (pricing.type === 'duration') {
    // Duration-based pricing is handled externally (by elapsed time),
    // not from usage metadata. Return 0 here — the session will track duration.
    return 0;
  }

  const rates = pricing.perMillionTokens;
  let cost = 0;

  // Input tokens by modality
  if (usage.promptTokensDetails?.length) {
    for (const detail of usage.promptTokensDetails) {
      const count = detail.tokenCount || 0;
      const rate = detail.modality === 'AUDIO' ? rates.audioInput : rates.textInput;
      cost += (count / TOKENS_PER_MILLION) * rate;
    }
  } else if (usage.promptTokenCount) {
    // Fallback: assume all input is audio (conservative estimate for transcription)
    cost += (usage.promptTokenCount / TOKENS_PER_MILLION) * rates.audioInput;
  }

  // Output tokens by modality
  if (usage.responseTokensDetails?.length) {
    for (const detail of usage.responseTokensDetails) {
      const count = detail.tokenCount || 0;
      const rate = detail.modality === 'AUDIO' ? rates.audioOutput : rates.textOutput;
      cost += (count / TOKENS_PER_MILLION) * rate;
    }
  } else if (usage.responseTokenCount) {
    // Fallback: assume audio output (conservative)
    cost += (usage.responseTokenCount / TOKENS_PER_MILLION) * rates.audioOutput;
  }

  return Number.isFinite(cost) ? cost : 0;
}

/**
 * Calculate USD cost for duration-based pricing from elapsed minutes.
 */
export function calculateDurationCostUsd(elapsedMinutes: number, perMinute: number): number {
  const cost = elapsedMinutes * perMinute;
  return Number.isFinite(cost) ? cost : 0;
}
