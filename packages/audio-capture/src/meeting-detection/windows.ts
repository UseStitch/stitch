import { mergeObservations } from './observations.js';
import { createNativeWatcherMeetingDetector } from './watcher.js';

import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';
import type { MeetingObservation } from './engine.js';
import type { WatchRow } from './watcher.js';

function normalizeProcessName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\.exe$/, '');
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

function classifyRow(row: WatchRow): MeetingObservation[] {
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

  if (
    (processName === 'teams' || processName === 'ms-teams') &&
    hasCallHint('teams', windowTitle)
  ) {
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

  if (
    (processName === 'chrome' || processName === 'msedge') &&
    /google meet|meet\.google\.com|^meet\s+-\s+/.test(windowTitle.toLowerCase())
  ) {
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

function classifyWindowsRows(rows: WatchRow[]): MeetingObservation[] {
  const observations = rows.flatMap(classifyRow);
  return mergeObservations(observations);
}

export function createWindowsMeetingDetector(
  options: MeetingDetectionOptions = {},
): MeetingDetector {
  return createNativeWatcherMeetingDetector('windows', classifyWindowsRows, options);
}

export const internal = {
  classifyRow,
};
