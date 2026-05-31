import { mergeObservations } from './observations.js';
import { createNativeWatcherMeetingDetector } from './watcher.js';

import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';
import type { MeetingObservation } from './engine.js';
import type { WatchRow } from './watcher.js';

function normalizeProcessName(input: string): string {
  return input.trim().toLowerCase();
}

function toDesktopObservation(row: WatchRow): MeetingObservation | null {
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

function toBrowserObservation(row: WatchRow): MeetingObservation | null {
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

function classifyRow(row: WatchRow): MeetingObservation[] {
  return [toDesktopObservation(row), toBrowserObservation(row)].filter(
    (value): value is MeetingObservation => Boolean(value),
  );
}

function classifyMacosRows(rows: WatchRow[]): MeetingObservation[] {
  const observations = rows.flatMap(classifyRow);
  return mergeObservations(observations);
}

export function createMacosMeetingDetector(options: MeetingDetectionOptions = {}): MeetingDetector {
  return createNativeWatcherMeetingDetector('macos', classifyMacosRows, options);
}

export const internal = {
  toDesktopObservation,
  toBrowserObservation,
  classifyRow,
};
