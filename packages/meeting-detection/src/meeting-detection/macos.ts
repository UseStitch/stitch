import { mergeObservations } from './observations.js';
import { createNativeWatcherMeetingDetector } from './watcher.js';

import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';
import type { MeetingObservation } from './engine.js';
import type { WatchRow } from './watcher.js';

const GOOGLE_MEET_TITLE_RE = /google meet|meet\.google\.com/i;

type DesktopApp = {
  match: string;
  key: string;
  platform: Extract<MeetingObservation['platform'], 'zoom' | 'teams' | 'slack' | 'discord'>;
  displayName: string;
};

const DESKTOP_APPS: readonly DesktopApp[] = [
  { match: 'zoom', key: 'desktop:zoom', platform: 'zoom', displayName: 'Zoom' },
  { match: 'teams', key: 'desktop:teams', platform: 'teams', displayName: 'Microsoft Teams' },
  { match: 'slack', key: 'desktop:slack', platform: 'slack', displayName: 'Slack' },
  { match: 'discord', key: 'desktop:discord', platform: 'discord', displayName: 'Discord' },
];

function normalizeProcessName(input: string): string {
  return input.trim().toLowerCase();
}

function toDesktopObservation(row: WatchRow): MeetingObservation | null {
  const rawProcessName = row.processName.trim();
  if (!rawProcessName) {
    return null;
  }

  const processName = normalizeProcessName(rawProcessName);
  const app = DESKTOP_APPS.find((candidate) => processName.includes(candidate.match));
  if (!app) {
    return null;
  }

  return {
    key: app.key,
    platform: app.platform,
    kind: 'desktop',
    displayName: app.displayName,
    processNames: [rawProcessName],
    windowTitle: null,
  };
}

function toBrowserObservation(row: WatchRow): MeetingObservation | null {
  const rawProcessName = row.processName.trim();
  if (!rawProcessName) {
    return null;
  }

  const processName = normalizeProcessName(rawProcessName);
  const windowTitle = row.windowTitle?.trim() || '';
  if (!windowTitle || !GOOGLE_MEET_TITLE_RE.test(windowTitle)) {
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
  return createNativeWatcherMeetingDetector(classifyMacosRows, options);
}

export const internal = {
  toDesktopObservation,
  toBrowserObservation,
  classifyRow,
};
