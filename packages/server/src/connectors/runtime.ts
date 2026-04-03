import type { ConnectorModule } from '@stitch-connectors/sdk';

import { getConnectorModules } from '@/connectors/definitions/index.js';
import { getDb } from '@/db/client.js';
import { connectorInstances } from '@/db/schema.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'connector-runtime' });

const modulesById = new Map<string, ConnectorModule>();

async function refreshConnectorToolsets(connectorId: string): Promise<void> {
  if (connectorId === 'google') {
    const mod = await import('@/connectors/google-toolsets.js');
    await mod.registerGoogleToolsets();
  }
}

function registerModules(modules: ConnectorModule[]): void {
  modulesById.clear();
  for (const module of modules) {
    modulesById.set(module.definition.id, module);
  }
}

function getLifecycleContext(connectorId: string) {
  return {
    listInstances: async (id: string) => {
      const db = getDb();
      const rows = await db.select().from(connectorInstances);
      return rows.filter((row) => row.connectorId === id);
    },
    refreshToolsets: async () => refreshConnectorToolsets(connectorId),
  };
}

export function getConnectorModule(connectorId: string): ConnectorModule | undefined {
  return modulesById.get(connectorId);
}

export async function initConnectorRuntime(): Promise<void> {
  const modules = getConnectorModules();
  registerModules(modules);

  for (const module of modules) {
    const context = getLifecycleContext(module.definition.id);
    await module.lifecycle?.register?.(context);
  }

  for (const module of modules) {
    const context = getLifecycleContext(module.definition.id);
    await module.lifecycle?.init?.(context);
  }

  log.info(
    { event: 'connector-runtime.initialized', connectors: modules.map((m) => m.definition.id) },
    'connector runtime initialized',
  );
}

export async function shutdownConnectorRuntime(): Promise<void> {
  const modules = [...modulesById.values()];
  for (const module of modules) {
    const context = getLifecycleContext(module.definition.id);
    await module.lifecycle?.shutdown?.(context);
  }
  modulesById.clear();
  log.info({ event: 'connector-runtime.stopped' }, 'connector runtime stopped');
}

export async function refreshConnectorToolsetsFor(connectorId: string): Promise<void> {
  await refreshConnectorToolsets(connectorId);
}
