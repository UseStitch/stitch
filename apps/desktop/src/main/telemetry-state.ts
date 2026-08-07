import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import { createTelemetryClientId, ID_PREFIXES, isIdOfType } from '@stitch/shared/id';
import type { TelemetryState } from '@stitch/shared/telemetry/types';

const TELEMETRY_FILE = 'telemetry.json';
let state: TelemetryState | null = null;
let initPromise: Promise<TelemetryState> | null = null;

function getTelemetryFilePath(): string {
  return path.join(app.getPath('userData'), TELEMETRY_FILE);
}

function readStateFromDisk(): TelemetryState | null {
  try {
    const raw = fs.readFileSync(getTelemetryFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<TelemetryState>;
    if (
      typeof parsed.clientInstallationId === 'string' &&
      isIdOfType(parsed.clientInstallationId, ID_PREFIXES.telemetryClient) &&
      typeof parsed.enabled === 'boolean'
    ) {
      return {
        clientInstallationId: parsed.clientInstallationId,
        enabled: parsed.enabled,
        lastActiveDate: typeof parsed.lastActiveDate === 'string' ? parsed.lastActiveDate : null,
        lastMessageDate: typeof parsed.lastMessageDate === 'string' ? parsed.lastMessageDate : null,
      };
    }
  } catch {
    // missing, malformed, or unreadable — will bootstrap fresh
  }
  return null;
}

function writeStateToDisk(s: TelemetryState): void {
  try {
    fs.writeFileSync(getTelemetryFilePath(), JSON.stringify(s), 'utf-8');
  } catch {
    // best-effort persistence
  }
}

/**
 * Initialize telemetry state. Idempotent — concurrent calls return the same promise.
 */
export function initTelemetryState(): Promise<TelemetryState> {
  if (initPromise) return initPromise;
  initPromise = Promise.resolve().then(() => {
    if (state) return state;

    const existing = readStateFromDisk();
    if (existing) {
      state = existing;
      return state;
    }

    const newState: TelemetryState = {
      clientInstallationId: createTelemetryClientId(),
      enabled: true,
      lastActiveDate: null,
      lastMessageDate: null,
    };
    writeStateToDisk(newState);
    state = newState;
    return state;
  });
  return initPromise;
}

/**
 * Get the current telemetry state synchronously. Must call initTelemetryState first.
 */
export function getTelemetryState(): TelemetryState {
  if (!state) throw new Error('Telemetry state not initialized.');
  return state;
}

/**
 * Update telemetry enabled preference. Persists to disk immediately.
 */
export function setTelemetryEnabled(enabled: boolean): TelemetryState {
  if (!state) throw new Error('Telemetry state not initialized.');
  state = { ...state, enabled };
  writeStateToDisk(state);
  return state;
}
