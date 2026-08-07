import { createTelemetryClientId, ID_PREFIXES, isIdOfType } from '@stitch/shared/id';
import { EVENT_SCHEMA_VERSION, type TelemetryEventName, type TelemetryEvents } from '@stitch/shared/telemetry/events';
import { DEFAULT_POSTHOG_HOST, type TelemetryState } from '@stitch/shared/telemetry/types';

const LOCALSTORAGE_KEY = 'stitch_telemetry_state';
const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

let state: TelemetryState | null = null;
let posthogLoaded = false;
let posthog: typeof import('posthog-js').default | null = null;

// ---------------------------------------------------------------------------
// State management (Electron IPC with localStorage fallback)
// ---------------------------------------------------------------------------

async function loadState(): Promise<TelemetryState> {
  // Prefer Electron IPC
  if (window.api?.telemetry) {
    return window.api.telemetry.getState();
  }

  // localStorage fallback for browser/dev
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_KEY);
    if (raw) {
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
    }
  } catch {
    // ignore
  }

  // Generate new state
  const newState: TelemetryState = {
    clientInstallationId: createTelemetryClientId(),
    enabled: true,
    lastActiveDate: null,
    lastMessageDate: null,
  };
  persistLocalState(newState);
  return newState;
}

function persistLocalState(s: TelemetryState): void {
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(s));
  } catch {
    // quota or private browsing
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the client telemetry service. Must be called once during app startup.
 * No-op if PostHog key is not configured or telemetry is disabled.
 */
export async function initClientTelemetry(): Promise<void> {
  state = await loadState();

  const key = getPostHogKey();
  if (!key || !state.enabled) return;

  await loadPostHog(key);
}

/**
 * Get the current telemetry state.
 */
export function getClientTelemetryState(): TelemetryState | null {
  return state;
}

/**
 * Set telemetry enabled/disabled. Persists via Electron IPC or localStorage.
 */
export async function setClientTelemetryEnabled(enabled: boolean): Promise<TelemetryState> {
  if (window.api?.telemetry) {
    state = await window.api.telemetry.setEnabled(enabled);
  } else if (state) {
    state = { ...state, enabled };
    persistLocalState(state);
  }

  if (!enabled) {
    if (posthog) {
      posthog.opt_out_capturing();
    }
  } else {
    if (posthog) {
      posthog.opt_in_capturing();
    } else {
      const key = getPostHogKey();
      if (key) await loadPostHog(key);
    }
  }

  return state as TelemetryState;
}

/**
 * Capture a client-owned event, respecting consent and daily rate-limiting.
 */
export function captureClientEvent<T extends TelemetryEventName>(
  eventName: T,
  extraProperties?: TelemetryEvents[T],
): void {
  if (!state?.enabled || !posthog || !posthogLoaded) return;

  if (eventName === 'app_active' && !passesOncePerDay('lastActiveDate')) return;
  if (eventName === 'message_sent' && !passesOncePerDay('lastMessageDate')) return;

  posthog.capture(eventName, {
    event_schema_version: EVENT_SCHEMA_VERSION,
    app_version: APP_VERSION,
    platform: getPlatform(),
    release_channel: getReleaseChannel(),
    client_type: getClientType(),
    actor_type: 'client',
    ...extraProperties,
  });
}

// ---------------------------------------------------------------------------
// PostHog loader
// ---------------------------------------------------------------------------

async function loadPostHog(key: string): Promise<void> {
  if (posthogLoaded) return;

  try {
    const mod = await import('posthog-js');
    posthog = mod.default;

    posthog.init(key, {
      api_host: DEFAULT_POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      person_profiles: 'never',
      persistence: 'memory',
      loaded: (ph) => {
        if (state) {
          ph.identify(state.clientInstallationId);
        }
      },
    });

    posthogLoaded = true;
  } catch {
    posthog = null;
    posthogLoaded = false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPostHogKey(): string | null {
  const key = (import.meta as { env?: Record<string, string> }).env?.['VITE_POSTHOG_KEY'] ?? '';
  return key.length > 0 ? key : null;
}

function getUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function passesOncePerDay(field: 'lastActiveDate' | 'lastMessageDate'): boolean {
  if (!state) return false;
  const today = getUtcDateString();
  if (state[field] === today) return false;

  state = { ...state, [field]: today };
  if (window.api?.telemetry) {
    void window.api.telemetry.setEnabled(state.enabled);
  } else {
    persistLocalState(state);
  }
  return true;
}

function getPlatform(): string {
  return window.electron?.platform ?? navigator.platform ?? 'unknown';
}

function getReleaseChannel(): string {
  if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__ !== 'dev') {
    return 'production';
  }
  return 'development';
}

function getClientType(): string {
  return window.api ? 'desktop' : 'web';
}
