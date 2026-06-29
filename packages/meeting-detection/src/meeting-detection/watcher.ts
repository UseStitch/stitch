import { noopLogger } from '@stitch/shared/logger';

import { startWatcher, stopWatcher } from '../native.js';
import { createMeetingDetectionEngine } from './engine.js';

import type { NativeWatchEvent, NativeWatchRow } from '../native.js';
import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';
import type { MeetingObservation } from './engine.js';

export type WatchRow = NativeWatchRow;

/** Per-platform row classification implemented in the classifier files. */
type RowClassifier = (rows: WatchRow[]) => MeetingObservation[];

export function createNativeWatcherMeetingDetector(
  classify: RowClassifier,
  options: MeetingDetectionOptions = {},
): MeetingDetector {
  const engine = createMeetingDetectionEngine(options);
  const log = options.logger ?? noopLogger;

  let running = false;

  function handleEvent(event: NativeWatchEvent): void {
    if (event.kind === 'error') {
      log.error({ message: event.message ?? 'unknown' }, 'native watcher error');
      return;
    }
    engine.ingest(classify(event.rows ?? []));
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      startWatcher((_err, event) => handleEvent(event));
    },

    stop(): void {
      running = false;
      stopWatcher();
    },

    subscribe: engine.subscribe.bind(engine),
    getActive: engine.getActive.bind(engine),
    dismiss: engine.dismiss.bind(engine),
  };
}
