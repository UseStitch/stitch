import * as Log from '@/lib/log.js';
import type { Toolset } from '@/tools/toolsets/types.js';

const log = Log.create({ service: 'toolset-registry' });

/** Global registry of all available toolsets (browser, meetings, MCP servers, etc.) */
const toolsets = new Map<string, Toolset>();

export function registerToolset(toolset: Toolset): void {
  if (toolsets.has(toolset.id)) {
    log.warn(
      { event: 'toolset.register.overwrite', toolsetId: toolset.id },
      'overwriting existing toolset registration',
    );
  }

  toolsets.set(toolset.id, toolset);

  log.info(
    {
      event: 'toolset.registered',
      toolsetId: toolset.id,
      toolsetName: toolset.name,
      toolCount: toolset.tools().length,
    },
    'toolset registered',
  );
}

export function getToolset(toolsetId: string): Toolset | undefined {
  return toolsets.get(toolsetId);
}

export function listToolsets(): Toolset[] {
  return [...toolsets.values()];
}

export function listToolsetIds(): string[] {
  return [...toolsets.keys()];
}

export function unregisterToolset(toolsetId: string): boolean {
  const removed = toolsets.delete(toolsetId);
  if (removed) {
    log.info({ event: 'toolset.unregistered', toolsetId }, 'toolset unregistered');
  }
  return removed;
}
