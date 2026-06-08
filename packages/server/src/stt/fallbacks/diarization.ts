import type { AudioSource, TranscriptEvent } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'stt.fallback.diarization' });

type DiarizationFallbackConfig = {
  /** Display name for the mic source (the local user). */
  micSpeakerName: string;
  /** Display name for the speaker source (the remote participant). */
  speakerSpeakerName: string;
};

export type DiarizationFallback = {
  /** Tag a transcript event with the appropriate speaker based on audio source. */
  tagTranscript(event: TranscriptEvent, source: AudioSource): TranscriptEvent;
  /** Check if this fallback can operate (needs multiple sources). */
  canOperate(sources: AudioSource[]): boolean;
};

/**
 * Dual-stream diarization fallback.
 *
 * Uses the audio source ('mic' vs 'speaker') to determine speaker identity.
 * This generalizes the existing approach of running two streams for meetings.
 *
 * When only a single source is available, diarization degrades — the fallback
 * reports that it cannot distinguish speakers.
 */
export function createDiarizationFallback(config: DiarizationFallbackConfig): DiarizationFallback {
  const speakerMap: Record<AudioSource, string> = {
    mic: config.micSpeakerName,
    speaker: config.speakerSpeakerName,
  };

  function tagTranscript(event: TranscriptEvent, source: AudioSource): TranscriptEvent {
    const speaker = speakerMap[source];
    return {
      ...event,
      speaker,
      words: event.words?.map((w) => ({ ...w, speaker })),
    };
  }

  function canOperate(sources: AudioSource[]): boolean {
    const unique = new Set(sources);
    if (unique.size < 2) {
      log.debug('diarization fallback degraded: single audio source');
      return false;
    }
    return true;
  }

  return { tagTranscript, canOperate };
}
