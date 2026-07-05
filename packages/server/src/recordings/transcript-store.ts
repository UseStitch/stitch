import type { PrefixedString } from '@stitch/shared/id';
import type { RecordingTranscriptEntry } from '@stitch/shared/recordings/types';
import type { AudioSource } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import { writeRecordingTranscript } from '@/recordings/file-store.js';

const log = Log.create({ service: 'transcript-store' });

const FLUSH_INTERVAL_MS = 10_000;

type TranscriptEventInput = {
  kind: 'partial' | 'final';
  source: AudioSource;
  speaker: string;
  content: string;
  offsetMs: number;
};

type PendingPartial = { speaker: string; content: string; offsetMs: number };

/**
 * Internal entry that preserves arrival sequence for correct ordering.
 * The ordering buffer emits events in the correct interleaved order,
 * so `seq` is the authoritative ordering — NOT offsetMs alone.
 */
type InternalEntry = { seq: number; speaker: string; content: string; startMs: number; endMs: number };

type RecordingTranscriptState = {
  entries: InternalEntry[];
  pendingPartials: Map<AudioSource, PendingPartial>;
  flushTimer: ReturnType<typeof setInterval> | null;
  dirty: boolean;
  nextSeq: number;
};

const store = new Map<PrefixedString<'rec'>, RecordingTranscriptState>();

function getOrCreate(recordingId: PrefixedString<'rec'>): RecordingTranscriptState {
  let state = store.get(recordingId);
  if (!state) {
    state = { entries: [], pendingPartials: new Map(), flushTimer: null, dirty: false, nextSeq: 0 };
    store.set(recordingId, state);
  }
  return state;
}

export function startTranscriptCollection(recordingId: PrefixedString<'rec'>): void {
  const state = getOrCreate(recordingId);

  if (state.flushTimer) {
    clearInterval(state.flushTimer);
  }

  state.flushTimer = setInterval(() => {
    void flushTranscript(recordingId);
  }, FLUSH_INTERVAL_MS);

  log.info({ recordingId }, 'transcript collection started');
}

export function pushTranscriptEvent(recordingId: PrefixedString<'rec'>, event: TranscriptEventInput): void {
  const state = getOrCreate(recordingId);

  if (event.kind === 'final') {
    state.pendingPartials.delete(event.source);
    if (event.content.trim()) {
      state.entries.push({
        seq: state.nextSeq++,
        speaker: event.speaker,
        content: event.content,
        startMs: event.offsetMs,
        endMs: event.offsetMs,
      });
      state.dirty = true;
    }
  } else {
    if (event.content.trim()) {
      state.pendingPartials.set(event.source, {
        speaker: event.speaker,
        content: event.content,
        offsetMs: event.offsetMs,
      });
      state.dirty = true;
    }
  }
}

/**
 * Each final transcript event from the STT provider represents a distinct
 * committed utterance (one audio buffer commit = one speech turn). Following
 * Anarlog's approach, we never merge across commit boundaries — each final
 * is its own segment regardless of speaker continuity.
 *
 * Build the transcript snapshot for persistence: sorted by sequence order.
 */
function buildSnapshot(state: RecordingTranscriptState): RecordingTranscriptEntry[] {
  const all: InternalEntry[] = [...state.entries];
  for (const partial of state.pendingPartials.values()) {
    if (partial.content.trim()) {
      all.push({
        seq: state.nextSeq,
        speaker: partial.speaker,
        content: partial.content,
        startMs: partial.offsetMs,
        endMs: partial.offsetMs,
      });
    }
  }
  // Sort by sequence number — this is the ordering buffer's emission order.
  all.sort((a, b) => a.seq - b.seq);
  return all.map((e) => ({ speaker: e.speaker, content: e.content, startMs: e.startMs, endMs: e.endMs }));
}

async function flushTranscript(recordingId: PrefixedString<'rec'>): Promise<void> {
  const state = store.get(recordingId);
  if (!state || !state.dirty) return;

  const snapshot = buildSnapshot(state);
  state.dirty = false;

  try {
    await writeRecordingTranscript(recordingId, snapshot);
  } catch (error) {
    state.dirty = true;
    log.error({ recordingId, error }, 'failed to flush transcript to file');
  }
}

export async function finalFlushAndCleanup(recordingId: PrefixedString<'rec'>): Promise<void> {
  const state = store.get(recordingId);
  if (!state) return;

  if (state.flushTimer) {
    clearInterval(state.flushTimer);
    state.flushTimer = null;
  }

  // Promote partials for the final write
  for (const partial of state.pendingPartials.values()) {
    if (partial.content.trim()) {
      state.entries.push({
        seq: state.nextSeq++,
        speaker: partial.speaker,
        content: partial.content,
        startMs: partial.offsetMs,
        endMs: partial.offsetMs,
      });
    }
  }
  state.pendingPartials.clear();
  state.dirty = true;
  await flushTranscript(recordingId);

  store.delete(recordingId);
}
