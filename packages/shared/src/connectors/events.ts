import type { PrefixedString } from '../id/index.js';

export const CONNECTOR_EVENT_NAMES = [
  'connector.token.refreshed',
  'connector.auth.failed',
  'connector.authorized',
  'connector.removed',
] as const;

export type ConnectorEvents = {
  'connector.token.refreshed': { instanceId: PrefixedString<'conn'> };
  'connector.auth.failed': { instanceId: PrefixedString<'conn'> };
  'connector.authorized': { instanceId: PrefixedString<'conn'>; connectorId: string };
  'connector.removed': { instanceId: PrefixedString<'conn'> | null; connectorId: string };
};
