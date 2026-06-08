import type {
  CapabilityRequest,
  CapabilityResolution,
  CapabilitySupport,
  ModelCapabilities,
  STTCapability,
} from '@stitch/shared/stt/types';

const ALL_CAPABILITIES: STTCapability[] = [
  'partials',
  'word_timestamps',
  'utterance_timestamps',
  'diarization',
  'native_vad',
  'language_detection',
  'keyterm_biasing',
];

const FALLBACK_CAPABLE: Set<STTCapability> = new Set(['native_vad', 'diarization']);

export class CapabilityNegotiationError extends Error {
  constructor(public readonly unsatisfied: STTCapability[]) {
    super(`Required capabilities unsatisfied: ${unsatisfied.join(', ')}`);
    this.name = 'CapabilityNegotiationError';
  }
}

/**
 * Resolves requested capabilities against a model's declared native capabilities.
 * - Native support = 'native'
 * - Fallback available (VAD, diarization) = 'fallback'
 * - Otherwise = 'unsupported'
 *
 * Throws CapabilityNegotiationError if any 'required' capability resolves to 'unsupported'.
 */
export function resolve(
  request: CapabilityRequest,
  modelCapabilities: ModelCapabilities,
): CapabilityResolution {
  const satisfied = {} as Record<STTCapability, CapabilitySupport>;
  const degraded: STTCapability[] = [];
  const unsatisfied: STTCapability[] = [];

  for (const cap of ALL_CAPABILITIES) {
    if (modelCapabilities[cap]) {
      satisfied[cap] = 'native';
    } else if (FALLBACK_CAPABLE.has(cap)) {
      satisfied[cap] = 'fallback';
    } else {
      satisfied[cap] = 'unsupported';
    }
  }

  for (const [cap, level] of Object.entries(request) as [
    STTCapability,
    'required' | 'preferred',
  ][]) {
    if (satisfied[cap] === 'unsupported') {
      if (level === 'required') {
        unsatisfied.push(cap);
      } else {
        degraded.push(cap);
      }
    }
  }

  if (unsatisfied.length > 0) {
    throw new CapabilityNegotiationError(unsatisfied);
  }

  return { satisfied, degraded };
}
