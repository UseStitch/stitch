import type { ToolType } from '@stitch/shared/tools/types';

import { browserToolProvider, browserToolset } from '@/tools/providers/browser-provider.js';
import type { ToolProvider } from '@/tools/providers/types.js';
import { registerToolset } from '@/tools/toolsets/registry.js';

const providers: ToolProvider[] = [browserToolProvider];

/**
 * Return the known tool name/type/displayName triples for global provider tools.
 * Used by routes/config.ts for tool discovery.
 */
export async function getGlobalProviderKnownTools(): Promise<
  { toolType: ToolType; toolName: string; displayName: string }[]
> {
  if (providers.length === 0) return [];

  const knownTools: { toolType: ToolType; toolName: string; displayName: string }[] = [];
  for (const provider of providers) {
    knownTools.push(...provider.knownTools());
  }

  return knownTools;
}

/**
 * Register all built-in provider toolsets (browser, meetings) with the global registry.
 * Call once at startup.
 */
export function registerProviderToolsets(): void {
  registerToolset(browserToolset);
}
