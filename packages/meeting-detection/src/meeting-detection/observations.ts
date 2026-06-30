import type { MeetingObservation } from './engine.js';

export function mergeObservations(observations: MeetingObservation[]): MeetingObservation[] {
  const merged = new Map<string, MeetingObservation>();

  for (const observation of observations) {
    const existing = merged.get(observation.key);
    if (!existing) {
      merged.set(observation.key, observation);
      continue;
    }

    const processNames = new Set([...existing.processNames, ...observation.processNames]);
    merged.set(observation.key, {
      ...existing,
      processNames: [...processNames],
      windowTitle: existing.windowTitle ?? observation.windowTitle,
    });
  }

  return [...merged.values()];
}
