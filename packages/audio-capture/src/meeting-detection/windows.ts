import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';

import type { MeetingObservation } from './shared.js';
import { createNativeWatcherMeetingDetector } from './watcher.js';
import type { WatchRow } from './watcher.js';

type WindowsProcessRow = WatchRow;

function normalizeProcessName(input: string): string {
  return input.trim().toLowerCase().replace(/\.exe$/, '');
}

function parseRows(stdout: string): WindowsProcessRow[] {
  const raw = stdout.trim();
  if (!raw || raw === 'null') {
    return [];
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed) {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed as WindowsProcessRow[];
  }

  return [parsed as WindowsProcessRow];
}

function hasCallHint(platform: 'teams' | 'slack' | 'discord', title: string): boolean {
  const normalized = title.toLowerCase();

  if (platform === 'teams') {
    return /meeting|call|microsoft teams|teams/.test(normalized);
  }

  if (platform === 'slack') {
    return /huddle|call/.test(normalized);
  }

  return /call|voice|stage/.test(normalized);
}

function classifyRow(row: WindowsProcessRow): MeetingObservation[] {
  const rawProcessName = row.processName?.trim();
  if (!rawProcessName) {
    return [];
  }

  const processName = normalizeProcessName(rawProcessName);
  const windowTitle = row.windowTitle?.trim() || '';
  const observations: MeetingObservation[] = [];

  if (processName === 'zoom' && windowTitle.length > 0) {
    observations.push({
      key: 'desktop:zoom',
      platform: 'zoom',
      kind: 'desktop',
      displayName: 'Zoom',
      processNames: [rawProcessName],
      windowTitle,
    });
  }

  if ((processName === 'teams' || processName === 'ms-teams') && hasCallHint('teams', windowTitle)) {
    observations.push({
      key: 'desktop:teams',
      platform: 'teams',
      kind: 'desktop',
      displayName: 'Microsoft Teams',
      processNames: [rawProcessName],
      windowTitle: windowTitle || null,
    });
  }

  if (processName === 'slack' && hasCallHint('slack', windowTitle)) {
    observations.push({
      key: 'desktop:slack',
      platform: 'slack',
      kind: 'desktop',
      displayName: 'Slack',
      processNames: [rawProcessName],
      windowTitle: windowTitle || null,
    });
  }

  if (processName === 'discord') {
    observations.push({
      key: 'desktop:discord',
      platform: 'discord',
      kind: 'desktop',
      displayName: 'Discord',
      processNames: [rawProcessName],
      windowTitle: windowTitle || null,
    });
  }

  if ((processName === 'chrome' || processName === 'msedge') && /google meet|meet\.google\.com|^meet\s+-\s+/.test(windowTitle.toLowerCase())) {
    observations.push({
      key: `browser:google-meet:${processName}`,
      platform: 'google-meet',
      kind: 'browser',
      displayName: 'Google Meet',
      processNames: [rawProcessName],
      windowTitle: windowTitle || null,
    });
  }

  return observations;
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

function classifyWindowsRows(rows: WindowsProcessRow[]): MeetingObservation[] {
  const observations = rows.flatMap(classifyRow);
  return mergeObservations(observations);
}

export function createWindowsMeetingDetector(options: MeetingDetectionOptions = {}): MeetingDetector {
  return createNativeWatcherMeetingDetector('windows', classifyWindowsRows, options);
}

export const internal = {
  parseRows,
  classifyRow,
  mergeObservations,
};
