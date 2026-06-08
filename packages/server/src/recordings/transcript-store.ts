import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';
import type { RecordingTranscriptEntry } from '@stitch/shared/recordings/types';
import type { AudioSource } from '@stitch/shared/stt/types';

import { getDb } from '@/db/client.js';
import { recordingAnalyses } from '@/db/schema/recordings.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'transcript-store' });

const FLUSH_INTERVAL_MS = 10_000;

type TranscriptEventInput = {
  kind: 'partial' | 'final';
  source: AudioSource;
  speaker: string;
  content: string;
};

type PendingPartial = {
  speaker: string;
  content: string;
};

type RecordingTranscriptState = {
  /** Committed transcript entries ready for persistence */
  entries: RecordingTranscriptEntry[];
  /** Current pending partial per source — promoted to entry on final or new utterance */
  pendingPartials: Map<AudioSource, PendingPartial>;
  flushTimer: ReturnType<typeof setInterval> | null;
  dirty: boolean;
};

const store = new Map<PrefixedString<'rec'>, RecordingTranscriptState>();

function getOrCreate(recordingId: PrefixedString<'rec'>): RecordingTranscriptState {
  let state = store.get(recordingId);
  if (!state) {
    state = { entries: [], pendingPartials: new Map(), flushTimer: null, dirty: false };
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

export function pushTranscriptEvent(
  recordingId: PrefixedString<'rec'>,
  event: TranscriptEventInput,
): void {
  const state = getOrCreate(recordingId);

  if (event.kind === 'final') {
    state.pendingPartials.delete(event.source);
    if (event.content.trim()) {
      state.entries.push({ speaker: event.speaker, content: event.content });
      state.dirty = true;
    }
  } else {
    if (event.content.trim()) {
      state.pendingPartials.set(event.source, {
        speaker: event.speaker,
        content: event.content,
      });
      state.dirty = true;
    }
  }
}

/**
 * Merge adjacent entries by the same speaker into a single entry.
 */
function mergeAdjacentEntries(entries: RecordingTranscriptEntry[]): RecordingTranscriptEntry[] {
  const merged: RecordingTranscriptEntry[] = [];
  for (const entry of entries) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === entry.speaker) {
      last.content += ' ' + entry.content;
    } else {
      merged.push({ speaker: entry.speaker, content: entry.content });
    }
  }
  return merged;
}

/**
 * Build the full transcript snapshot: committed entries + any pending partials,
 * with adjacent same-speaker entries merged.
 */
function buildSnapshot(state: RecordingTranscriptState): RecordingTranscriptEntry[] {
  const raw = [...state.entries];
  for (const partial of state.pendingPartials.values()) {
    if (partial.content.trim()) {
      raw.push({ speaker: partial.speaker, content: partial.content });
    }
  }
  return mergeAdjacentEntries(raw);
}

async function flushTranscript(recordingId: PrefixedString<'rec'>): Promise<void> {
  const state = store.get(recordingId);
  if (!state || !state.dirty) return;

  const snapshot = buildSnapshot(state);
  state.dirty = false;

  try {
    const db = getDb();
    await db
      .update(recordingAnalyses)
      .set({
        transcript: snapshot,
        updatedAt: Date.now(),
      })
      .where(eq(recordingAnalyses.recordingId, recordingId));
  } catch (error) {
    state.dirty = true;
    log.error({ recordingId, error }, 'failed to flush transcript to database');
  }
}

export async function finalFlushAndCleanup(recordingId: PrefixedString<'rec'>): Promise<void> {
  const state = store.get(recordingId);
  if (!state) return;

  if (state.flushTimer) {
    clearInterval(state.flushTimer);
    state.flushTimer = null;
  }

  // Promote partials and merge everything for the final write
  for (const partial of state.pendingPartials.values()) {
    if (partial.content.trim()) {
      state.entries.push({ speaker: partial.speaker, content: partial.content });
    }
  }
  state.pendingPartials.clear();
  state.entries = mergeAdjacentEntries(state.entries);
  state.dirty = true;
  await flushTranscript(recordingId);

  store.delete(recordingId);
}
