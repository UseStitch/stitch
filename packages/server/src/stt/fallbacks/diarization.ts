import type { AudioSource, TranscriptEvent } from '@stitch/shared/stt/types';

type DiarizationFallbackConfig = {
  /** Display name for the mic source (the local user). */
  micSpeakerName: string;
  /** Display name for the speaker source (the remote participant). */
  speakerSpeakerName: string;
};

export type DiarizationFallback = {
  /** Tag a transcript event with the appropriate speaker based on audio source. */
  tagTranscript(event: TranscriptEvent, source: AudioSource): TranscriptEvent;
};

/**
 * Dual-stream diarization fallback.
 *
 * Uses the audio source ('mic' vs 'speaker') to determine speaker identity.
 * Each source feeds a dedicated STT connection, so the speaker is known by stream.
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

  return { tagTranscript };
}
