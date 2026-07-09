import { refreshConnectorToolsetsFor } from '@/connectors/runtime.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'connector-events-adapter' });

function refreshToolsets(connectorId: string): void {
  void refreshConnectorToolsetsFor(connectorId).catch((error) => {
    log.error({ connectorId, error }, 'failed to refresh connector toolsets after connector event');
  });
}

export function registerConnectorEventsAdapter(): void {
  internalBus.onSync('connector.authorized', (event) => refreshToolsets(event.connectorId));
  internalBus.onSync('connector.removed', (event) => refreshToolsets(event.connectorId));
}
