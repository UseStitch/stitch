import type {
  MeetingDetection,
  MeetingDetectionEvent,
  MeetingDetectionListener,
  MeetingDetectionOptions,
  MeetingDetector,
  MeetingKind,
  MeetingPlatform,
} from '../types.js';

type MeetingObservation = {
  key: string;
  platform: MeetingPlatform;
  kind: MeetingKind;
  displayName: string;
  processNames: string[];
  windowTitle: string | null;
};

type Candidate = {
  observation: MeetingObservation;
  firstSeenAt: number;
  lastSeenAt: number;
};

type PollFn = () => Promise<MeetingObservation[]>;

const DEFAULT_OPTIONS = {
  pollIntervalMs: 2_000,
  activationThresholdMs: 15_000,
  cooldownMs: 10 * 60_000,
} as const;

const PLATFORM_PRIORITY: ReadonlyArray<MeetingPlatform> = [
  'zoom',
  'teams',
  'slack',
  'discord',
  'google-meet',
];

function compareObservations(a: MeetingObservation, b: MeetingObservation): number {
  const platformScore = PLATFORM_PRIORITY.indexOf(a.platform) - PLATFORM_PRIORITY.indexOf(b.platform);
  if (platformScore !== 0) {
    return platformScore;
  }

  return a.key.localeCompare(b.key);
}

function toDetection(candidate: Candidate): MeetingDetection {
  return {
    key: candidate.observation.key,
    platform: candidate.observation.platform,
    kind: candidate.observation.kind,
    displayName: candidate.observation.displayName,
    processNames: candidate.observation.processNames,
    windowTitle: candidate.observation.windowTitle,
    firstSeenAt: candidate.firstSeenAt,
    lastSeenAt: candidate.lastSeenAt,
  };
}

export function createPollingMeetingDetector(
  poll: PollFn,
  options: MeetingDetectionOptions = {},
): MeetingDetector {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_OPTIONS.pollIntervalMs;
  const activationThresholdMs = options.activationThresholdMs ?? DEFAULT_OPTIONS.activationThresholdMs;
  const cooldownMs = options.cooldownMs ?? DEFAULT_OPTIONS.cooldownMs;

  const listeners = new Set<MeetingDetectionListener>();
  const candidates = new Map<string, Candidate>();
  const cooldownUntil = new Map<string, number>();

  let running = false;
  let active: MeetingDetection | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function emit(event: MeetingDetectionEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function scheduleNext(): void {
    if (!running) {
      return;
    }

    timer = setTimeout(() => {
      void tick();
    }, pollIntervalMs);
  }

  function clearEndedCandidates(now: number): void {
    for (const [key, candidate] of candidates.entries()) {
      if (now - candidate.lastSeenAt > pollIntervalMs * 2) {
        candidates.delete(key);
      }
    }
  }

  function upsertCandidates(observations: MeetingObservation[], now: number): void {
    for (const observation of observations) {
      const existing = candidates.get(observation.key);
      if (!existing) {
        candidates.set(observation.key, {
          observation,
          firstSeenAt: now,
          lastSeenAt: now,
        });
        continue;
      }

      existing.observation = observation;
      existing.lastSeenAt = now;
    }
  }

  function chooseCandidate(now: number): Candidate | null {
    const eligible: Candidate[] = [];

    for (const candidate of candidates.values()) {
      if (now - candidate.firstSeenAt < activationThresholdMs) {
        continue;
      }

      if ((cooldownUntil.get(candidate.observation.key) ?? 0) > now) {
        continue;
      }

      eligible.push(candidate);
    }

    if (eligible.length === 0) {
      return null;
    }

    eligible.sort((a, b) => compareObservations(a.observation, b.observation));
    return eligible[0] ?? null;
  }

  async function tick(): Promise<void> {
    if (!running) {
      return;
    }

    const now = Date.now();
    let observations: MeetingObservation[] = [];

    try {
      observations = await poll();
    } catch {
      scheduleNext();
      return;
    }

    const seenKeys = new Set(observations.map((observation) => observation.key));

    upsertCandidates(observations, now);
    clearEndedCandidates(now);

    if (active && !seenKeys.has(active.key)) {
      const endedKey = active.key;
      active = null;
      cooldownUntil.set(endedKey, now + cooldownMs);
      emit({ type: 'ended', key: endedKey, endedAt: now });
    }

    if (!active) {
      const next = chooseCandidate(now);
      if (next) {
        active = toDetection(next);
        emit({ type: 'detected', detection: active, detectedAt: now });
      }
    } else {
      const activeCandidate = candidates.get(active.key);
      if (activeCandidate) {
        active = toDetection(activeCandidate);
      }
    }

    scheduleNext();
  }

  return {
    start(): void {
      if (running) {
        return;
      }

      running = true;
      void tick();
    },

    stop(): void {
      running = false;
      active = null;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },

    subscribe(listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getActive(): MeetingDetection | null {
      return active;
    },
  };
}

export type { MeetingObservation };
