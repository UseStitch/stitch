import { registerAutomationsAdapter } from './automations.js';
import { registerConnectorEventsAdapter } from './connectors.js';
import { registerMemoryAdapter } from './memory.js';
import { registerSseAdapter } from './sse.js';
import { registerTitleGenerationAdapter } from './title-generation.js';
import { registerUsageAdapter } from './usage.js';

/**
 * Registers all adapters on the internal bus.
 * Called once during server startup.
 */
export function registerAdapters(): void {
  registerSseAdapter();
  registerAutomationsAdapter();
  registerConnectorEventsAdapter();
  registerUsageAdapter();
  registerTitleGenerationAdapter();
  registerMemoryAdapter();
}
