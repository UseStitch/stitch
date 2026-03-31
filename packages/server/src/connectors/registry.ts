import type { ConnectorDefinition } from '@stitch/shared/connectors/types';

import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'connector-registry' });

const definitions = new Map<string, ConnectorDefinition>();

export function registerConnector(definition: ConnectorDefinition): void {
  definitions.set(definition.id, definition);
  log.info(
    { event: 'connector.registered', connectorId: definition.id },
    `connector registered: ${definition.name}`,
  );
}

export function getConnectorDefinition(id: string): ConnectorDefinition | undefined {
  return definitions.get(id);
}

export function listConnectorDefinitions(): ConnectorDefinition[] {
  return [...definitions.values()];
}
