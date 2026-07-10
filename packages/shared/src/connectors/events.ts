export const CONNECTOR_EVENT_NAMES = [
  'connector.token.refreshed',
  'connector.auth.failed',
  'connector.authorized',
  'connector.removed',
] as const;

export type ConnectorEvents = {
  'connector.token.refreshed': { instanceId: string };
  'connector.auth.failed': { instanceId: string };
  'connector.authorized': { instanceId: string; connectorId: string };
  'connector.removed': { instanceId: string | null; connectorId: string };
};
