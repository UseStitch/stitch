import type { ConnectorDefinition } from '@stitch/shared/connectors/types';

import {
  ConnectorDuplicateVersionError,
  ConnectorEmptyVersionHistoryError,
  ConnectorVersionMismatchError,
} from '@/connectors/errors.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'connector-registry' });

const definitions = new Map<string, ConnectorDefinition>();

function validateDefinition(definition: ConnectorDefinition): void {
  if (definition.versionHistory.length === 0) {
    throw new ConnectorEmptyVersionHistoryError(definition.id);
  }

  const seen = new Set<number>();
  for (const version of definition.versionHistory) {
    if (seen.has(version.version)) {
      throw new ConnectorDuplicateVersionError(definition.id, version.version);
    }
    seen.add(version.version);
  }

  const maxVersion = Math.max(...definition.versionHistory.map((version) => version.version));
  if (definition.currentVersion !== maxVersion) {
    throw new ConnectorVersionMismatchError(definition.id, definition.currentVersion, maxVersion);
  }
}

export function registerConnector(definition: ConnectorDefinition): void {
  validateDefinition(definition);
  definitions.set(definition.id, definition);
  log.info({ event: 'connector.registered', connectorId: definition.id }, `connector registered: ${definition.name}`);
}

export function unregisterConnector(id: string): void {
  definitions.delete(id);
}

export function getConnectorDefinition(id: string): ConnectorDefinition | undefined {
  return definitions.get(id);
}

export function listConnectorDefinitions({
  includeDisabled = false,
}: { includeDisabled?: boolean } = {}): ConnectorDefinition[] {
  return [...definitions.values()].filter((definition) => includeDisabled || definition.enabled);
}
