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
 * Default PostHog ingest host.
 */
export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
