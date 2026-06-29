import { startWatcher, stopWatcher } from '../native.js';
import { createMeetingDetectionEngine } from './engine.js';

import type { NativeWatchEvent } from '../native.js';
import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';
import type { MeetingObservation } from './engine.js';

const RESTART_DELAY_MS = 2_000;

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

export type WatchRow = {
  pid?: number;
  processName?: string;
  windowTitle?: string | null;
};

/** Minimal re-use of per-platform row classification from the classifier files. */
type RowClassifier = (rows: WatchRow[]) => MeetingObservation[];

export function createNativeWatcherMeetingDetector(
  classify: RowClassifier,
  options: MeetingDetectionOptions = {},
): MeetingDetector {
  const engine = createMeetingDetectionEngine(options);
  const log = options.logger ?? noopLogger;

  let running = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  function handleEvent(event: NativeWatchEvent): void {
    if (event.kind === 'error') {
      log.error({ message: event.message ?? 'unknown' }, 'native watcher error');
      scheduleRestart();
      return;
    }
    engine.ingest(classify(event.rows ?? []));
  }

  function scheduleRestart(): void {
    if (!running || restartTimer) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!running) return;
      stopWatcher();
      startWatcher((_err, event) => handleEvent(event));
    }, RESTART_DELAY_MS);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      startWatcher((_err, event) => handleEvent(event));
    },

    stop(): void {
      running = false;
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      stopWatcher();
    },

    subscribe: engine.subscribe.bind(engine),
    getActive: engine.getActive.bind(engine),
  };
}
