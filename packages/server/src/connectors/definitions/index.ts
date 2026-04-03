import { googleConnectorModule } from '@stitch-connectors/google';

import type { ConnectorModule } from '@stitch-connectors/sdk';

import { registerConnector } from '@/connectors/registry.js';

export function getConnectorModules(): ConnectorModule[] {
  return [googleConnectorModule];
}

export function registerAllConnectors(modules = getConnectorModules()): void {
  for (const module of modules) {
    registerConnector(module.definition);
  }
}
