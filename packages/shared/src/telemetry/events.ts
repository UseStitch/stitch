/**
 * Telemetry event registry — single source of truth for all analytics events.
 *
 * To add a new event:
 * 1. Add a key to TelemetryEvents with its allowed properties type.
 * 2. Capture it via `captureClientEvent('your_event', { ... })`.
 */

export const EVENT_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Event registry: event name → allowed extra properties
// ---------------------------------------------------------------------------

export type TelemetryEvents = {
  app_active: { connection_mode?: 'local' | 'remote' };
};

export type TelemetryEventName = keyof TelemetryEvents;
