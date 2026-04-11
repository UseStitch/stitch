import { createMeetingDetectionEngine } from './engine.js';

import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';
import type { MeetingObservation } from './engine.js';

export type { MeetingObservation };

type PollFn = () => Promise<MeetingObservation[]>;

const DEFAULT_POLL_INTERVAL_MS = 2_000;

/**
 * Adapts a polling function into a MeetingDetector by wiring it to the
 * shared MeetingDetectionEngine. This is kept as a fallback / test adapter;
 * production code uses the event-driven watcher path.
 */
export function createPollingMeetingDetector(
  poll: PollFn,
  options: MeetingDetectionOptions = {},
): MeetingDetector {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const engine = createMeetingDetectionEngine(options);

  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function scheduleNext(): void {
    if (!running) return;
    timer = setTimeout(() => {
      void tick();
    }, pollIntervalMs);
  }

  async function tick(): Promise<void> {
    if (!running) return;

    let observations: MeetingObservation[] = [];
    try {
      observations = await poll();
    } catch {
      scheduleNext();
      return;
    }

    engine.ingest(observations);
    scheduleNext();
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      void tick();
    },

    stop(): void {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },

    subscribe: engine.subscribe.bind(engine),
    getActive: engine.getActive.bind(engine),
  };
}
