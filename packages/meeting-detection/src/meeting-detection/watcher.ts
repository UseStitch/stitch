import { noopLogger } from '@stitch/shared/logger';

import { startWatcher, stopWatcher } from '../native.js';
import { createMeetingDetectionEngine } from './engine.js';

import type { NativeWatchEvent, NativeWatchRow } from '../native.js';
import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';
import type { MeetingObservation } from './engine.js';

export type WatchRow = NativeWatchRow;

/** Per-platform row classification implemented in the classifier files. */
type RowClassifier = (rows: WatchRow[]) => MeetingObservation[];

// The native watcher is edge-triggered, but the engine activates a candidate
// only after it has been seen for the activation threshold. Re-feed the latest
// observations on an interval so the threshold is re-evaluated for stable calls.
const REINGEST_INTERVAL_MS = 1_000;

export function createNativeWatcherMeetingDetector(
  classify: RowClassifier,
  options: MeetingDetectionOptions = {},
): MeetingDetector {
  const engine = createMeetingDetectionEngine(options);
  const log = options.logger ?? noopLogger;

  let running = false;
  let lastObservations: MeetingObservation[] = [];
  let reingestTimer: ReturnType<typeof setInterval> | null = null;

  function handleEvent(event: NativeWatchEvent): void {
    if (event.kind === 'error') {
      log.error({ message: event.message ?? 'unknown' }, 'native watcher error');
      return;
    }
    lastObservations = classify(event.rows ?? []);
    engine.ingest(lastObservations);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      startWatcher((_err, event) => handleEvent(event));
      reingestTimer = setInterval(() => engine.ingest(lastObservations), REINGEST_INTERVAL_MS);
    },

    stop(): void {
      running = false;
      if (reingestTimer) {
        clearInterval(reingestTimer);
        reingestTimer = null;
      }
      lastObservations = [];
      stopWatcher();
    },

    subscribe: engine.subscribe.bind(engine),
    getActive: engine.getActive.bind(engine),
    dismiss: engine.dismiss.bind(engine),
  };
}
