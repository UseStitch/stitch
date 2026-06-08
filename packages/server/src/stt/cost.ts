import type { STTUsage } from '@stitch/shared/stt/types';

import type { STTPricing } from '@/stt/types.js';

/**
 * Calculates the cost of STT usage based on the provider's pricing model.
 */
export function calculateCost(pricing: STTPricing, usage: STTUsage): number {
  switch (pricing.type) {
    case 'duration': {
      const minutes = usage.durationMs / 60_000;
      return minutes * pricing.perMinuteUsd;
    }
    case 'token': {
      const audioInputTokens = usage.audioInputTokens ?? 0;
      const textOutputTokens = usage.textOutputTokens ?? 0;

      const audioInputCost = (audioInputTokens / 1_000_000) * pricing.perMillionTokens.audioInput;
      const textOutputCost = (textOutputTokens / 1_000_000) * pricing.perMillionTokens.textOutput;

      return audioInputCost + textOutputCost;
    }
  }
}
