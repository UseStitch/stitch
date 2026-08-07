/**
 * Client telemetry state persisted locally (Electron userData or localStorage).
 */
export type TelemetryState = {
  clientInstallationId: string;
  enabled: boolean;
  lastActiveDate: string | null;
  lastMessageDate: string | null;
};

/**
 * HTTP headers used for client-to-server telemetry attribution.
 */
export const TELEMETRY_HEADER_ENABLED = 'x-stitch-telemetry-enabled';
export const TELEMETRY_HEADER_ID = 'x-stitch-telemetry-id';

/**
 * Default PostHog ingest host.
 */
export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
