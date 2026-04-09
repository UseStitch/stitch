import { execFile } from 'node:child_process';

import { resolveNativeBinaryPath } from '../native-binary.js';
import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';

import { createPollingMeetingDetector } from './shared.js';
import type { MeetingObservation } from './shared.js';

type MacosMeetingRow = {
  pid?: number;
  processName?: string;
  windowTitle?: string;
};

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

function runNativeProcessScan(commandTimeoutMs: number): Promise<MacosMeetingRow[]> {
  return new Promise((resolve, reject) => {
    execFile(
      resolveNativeBinaryPath(),
      ['--list-macos-meeting-usage'],
      {
        timeout: commandTimeoutMs,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        try {
          resolve(parseRows(stdout));
        } catch (parseError) {
          reject(parseError);
        }
      },
    );
  });
}

export function createMacosMeetingDetector(options: MeetingDetectionOptions = {}): MeetingDetector {
  const commandTimeoutMs = options.commandTimeoutMs ?? 3_000;

  return createPollingMeetingDetector(async () => {
    const rows = await runNativeProcessScan(commandTimeoutMs);
    const observations = rows.flatMap(classifyRow);
    return mergeObservations(observations);
  }, options);
}

export const internal = {
  parseRows,
  toDesktopObservation,
  toBrowserObservation,
  classifyRow,
  mergeObservations,
};
