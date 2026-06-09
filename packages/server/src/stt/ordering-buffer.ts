import type { AudioSource, TranscriptEvent } from '@stitch/shared/stt/types';

/**
 * A tagged transcript event that includes which audio source it originated from.
 * Used internally by the ordering buffer to interleave dual-stream events.
 */
export type SourcedTranscriptEvent = TranscriptEvent & {
  source: AudioSource;
};

/**
 * TranscriptOrderingBuffer acts as a thin pass-through that tags events with
 * their source and emits them in arrival order (FIFO).
 *
 * Arrival order from independent STT connections is the correct temporal order:
 * when the mic user speaks, the mic final arrives; when the remote speaker speaks,
 * the speaker final arrives. Sorting by offsetMs is unreliable for providers
 * (like OpenAI) that don't provide real speech timestamps — offsetMs represents
 * API response time, not speech time.
 *
 * Each final event represents one committed utterance (one speech turn).
 * Downstream consumers never merge across these boundaries.
 */
export function createTranscriptOrderingBuffer(onEmit: (event: SourcedTranscriptEvent) => void) {
  let closed = false;

  function push(event: SourcedTranscriptEvent): void {
    if (closed) return;
    onEmit(event);
  }

  function drain(): void {
    closed = true;
  }

  return { push, drain };
}
