import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';

import type { MeetingObservation } from './shared.js';
import { createNativeWatcherMeetingDetector } from './watcher.js';
import type { WatchRow } from './watcher.js';

type MacosMeetingRow = WatchRow;

function normalizeProcessName(input: string): string {
  return input.trim().toLowerCase();
}

function parseRows(stdout: string): MacosMeetingRow[] {
  const raw = stdout.trim();
  if (!raw || raw === 'null') {
    return [];
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed) {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed as MacosMeetingRow[];
  }

  return [parsed as MacosMeetingRow];
}

function toDesktopObservation(row: MacosMeetingRow): MeetingObservation | null {
  const rawProcessName = row.processName?.trim();
  if (!rawProcessName) {
    return null;
  }

  const processName = normalizeProcessName(rawProcessName);
  if (processName.includes('zoom')) {
    return {
      key: 'desktop:zoom',
      platform: 'zoom',
      kind: 'desktop',
      displayName: 'Zoom',
      processNames: [rawProcessName],
      windowTitle: null,
    };
  }

  if (processName.includes('teams') || processName.includes('ms-teams')) {
    return {
      key: 'desktop:teams',
      platform: 'teams',
      kind: 'desktop',
      displayName: 'Microsoft Teams',
      processNames: [rawProcessName],
      windowTitle: null,
    };
  }

  if (processName.includes('slack')) {
    return {
      key: 'desktop:slack',
      platform: 'slack',
      kind: 'desktop',
      displayName: 'Slack',
      processNames: [rawProcessName],
      windowTitle: null,
    };
  }

  if (processName.includes('discord')) {
    return {
      key: 'desktop:discord',
      platform: 'discord',
      kind: 'desktop',
      displayName: 'Discord',
      processNames: [rawProcessName],
      windowTitle: null,
    };
  }

  return null;
}

function toBrowserObservation(row: MacosMeetingRow): MeetingObservation | null {
  const rawProcessName = row.processName?.trim();
  if (!rawProcessName) {
    return null;
  }

  const processName = normalizeProcessName(rawProcessName);
  const windowTitle = row.windowTitle?.trim() || '';
  if (!windowTitle || !/google meet|meet\.google\.com/i.test(windowTitle)) {
    return null;
  }

  if (processName.includes('chrome')) {
    return {
      key: 'browser:google-meet:chrome',
      platform: 'google-meet',
      kind: 'browser',
      displayName: 'Google Meet',
      processNames: [rawProcessName],
      windowTitle,
    };
  }

  if (processName.includes('edge') || processName.includes('msedge')) {
    return {
      key: 'browser:google-meet:edge',
      platform: 'google-meet',
      kind: 'browser',
      displayName: 'Google Meet',
      processNames: [rawProcessName],
      windowTitle,
    };
  }

  return null;
}

function classifyRow(row: MacosMeetingRow): MeetingObservation[] {
  return [toDesktopObservation(row), toBrowserObservation(row)].filter(
    (value): value is MeetingObservation => Boolean(value),
  );
}

function mergeObservations(observations: MeetingObservation[]): MeetingObservation[] {
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

function classifyMacosRows(rows: MacosMeetingRow[]): MeetingObservation[] {
  const observations = rows.flatMap(classifyRow);
  return mergeObservations(observations);
}

export function createMacosMeetingDetector(options: MeetingDetectionOptions = {}): MeetingDetector {
  return createNativeWatcherMeetingDetector('macos', classifyMacosRows, options);
}

export const internal = {
  parseRows,
  toDesktopObservation,
  toBrowserObservation,
  classifyRow,
  mergeObservations,
};
