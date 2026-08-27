import type { PrefixedString } from '../id/index.js';

/**
 * Client telemetry state persisted locally (Electron userData or localStorage).
 */
export type TelemetryState = {
  clientInstallationId: PrefixedString<'tcli'>;
  enabled: boolean;
  lastActiveDate: string | null;
  lastMessageDate: string | null;
};

/**
 * Default PostHog ingest host.
 */
export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
