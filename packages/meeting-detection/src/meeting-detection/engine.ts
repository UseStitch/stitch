import type {
  MeetingDetection,
  MeetingDetectionEvent,
  MeetingDetectionListener,
  MeetingDetector,
  MeetingKind,
  MeetingPlatform,
} from '../types.js';

export type MeetingObservation = {
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

type MeetingEngineOptions = {
  activationThresholdMs?: number;
  cooldownMs?: number;
  staleCandidateThresholdMs?: number;
  endGraceMs?: number;
  minRepromptIntervalMs?: number;
};

const DEFAULT_ACTIVATION_THRESHOLD_MS = 15_000;
const DEFAULT_COOLDOWN_MS = 10 * 60_000;
const DEFAULT_END_GRACE_MS = 20_000;
const DEFAULT_MIN_REPROMPT_INTERVAL_MS = 2 * 60_000;

type MeetingDetectionEngine = Pick<MeetingDetector, 'subscribe' | 'getActive' | 'dismiss'> & {
  ingest: (observations: MeetingObservation[], now?: number) => void;
};

const PLATFORM_PRIORITY: ReadonlyArray<MeetingPlatform> = [
  'zoom',
  'teams',
  'slack',
  'discord',
  'google-meet',
];

function compareObservations(a: MeetingObservation, b: MeetingObservation): number {
  const platformScore =
    PLATFORM_PRIORITY.indexOf(a.platform) - PLATFORM_PRIORITY.indexOf(b.platform);
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

export function createMeetingDetectionEngine(
  options: MeetingEngineOptions = {},
): MeetingDetectionEngine {
  const activationThresholdMs = options.activationThresholdMs ?? DEFAULT_ACTIVATION_THRESHOLD_MS;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const staleCandidateThresholdMs = options.staleCandidateThresholdMs ?? activationThresholdMs * 2;
  const endGraceMs = options.endGraceMs ?? DEFAULT_END_GRACE_MS;
  const minRepromptIntervalMs = options.minRepromptIntervalMs ?? DEFAULT_MIN_REPROMPT_INTERVAL_MS;

  if (staleCandidateThresholdMs < activationThresholdMs) {
    throw new Error(
      `staleCandidateThresholdMs (${staleCandidateThresholdMs}) must be >= activationThresholdMs (${activationThresholdMs})`,
    );
  }

  const listeners = new Set<MeetingDetectionListener>();
  const candidates = new Map<string, Candidate>();
  const cooldownUntil = new Map<string, number>();
  const dismissedKeys = new Set<string>();
  let active: MeetingDetection | null = null;
  let pendingEndSince: number | null = null;
  let lastDetectedEmitAt: number | null = null;

  function emit(event: MeetingDetectionEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function clearStaleCandidates(now: number): void {
    for (const [key, candidate] of candidates.entries()) {
      if (now - candidate.lastSeenAt > staleCandidateThresholdMs) {
        candidates.delete(key);
      }
    }
  }

  function upsertCandidates(observations: MeetingObservation[], now: number): void {
    for (const observation of observations) {
      const existing = candidates.get(observation.key);
      if (!existing) {
        candidates.set(observation.key, { observation, firstSeenAt: now, lastSeenAt: now });
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
      if (dismissedKeys.has(candidate.observation.key)) {
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

  function endActiveMeeting(now: number): void {
    if (!active) {
      return;
    }
    const endedKey = active.key;
    active = null;
    pendingEndSince = null;
    cooldownUntil.set(endedKey, now + cooldownMs);
    dismissedKeys.delete(endedKey);
    emit({ type: 'ended', key: endedKey, endedAt: now });
  }

  return {
    ingest(observations: MeetingObservation[], now: number = Date.now()): void {
      const seenKeys = new Set(observations.map((o) => o.key));

      upsertCandidates(observations, now);
      clearStaleCandidates(now);

      if (active && !seenKeys.has(active.key)) {
        pendingEndSince ??= now;
        if (now - pendingEndSince >= endGraceMs) {
          endActiveMeeting(now);
        }
      } else if (active) {
        pendingEndSince = null;
        const activeCandidate = candidates.get(active.key);
        if (activeCandidate) {
          active = toDetection(activeCandidate);
        }
      }

      if (!active) {
        const next = chooseCandidate(now);
        if (
          next &&
          (lastDetectedEmitAt === null || now - lastDetectedEmitAt >= minRepromptIntervalMs)
        ) {
          active = toDetection(next);
          pendingEndSince = null;
          lastDetectedEmitAt = now;
          emit({ type: 'detected', detection: active, detectedAt: now });
        }
      }
    },

    dismiss(key: string, _now: number = Date.now()): void {
      dismissedKeys.add(key);
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
