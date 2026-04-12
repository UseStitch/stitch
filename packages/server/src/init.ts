import { syncAllAutomationSchedules } from '@/automations/scheduler.js';
import { registerAllConnectors } from '@/connectors/definitions/index.js';
import { initConnectorRuntime } from '@/connectors/runtime.js';
import { initDb } from '@/db/client.js';
import * as Log from '@/lib/log.js';
import { refreshMcpToolsets } from '@/mcp/tool-executor.js';
import { getMemoryConfig } from '@/memory/config.js';
import { initLocalEmbedder } from '@/memory/embedding/local-embedder.js';
import { startMeetingDetection } from '@/recordings/meeting-detection.js';
import { startScheduler } from '@/scheduler/runtime.js';
import { createAgendaToolset } from '@/tools/core/agenda.js';
import { registerProviderToolsets } from '@/tools/providers/index.js';
import { registerToolset } from '@/tools/toolsets/registry.js';

const log = Log.create({ service: 'init' });

export async function init() {
  await Log.init({ print: false });

  await initDb();

  const memoryConfig = await getMemoryConfig();
  if (!memoryConfig.embeddingProviderId || !memoryConfig.embeddingModelId) {
    await initLocalEmbedder();
  }

  // Register all toolsets (built-in providers + MCP servers + agenda)
  registerProviderToolsets();
  registerToolset(createAgendaToolset());
  await refreshMcpToolsets();

  // Register connector definitions and start token refresh
  registerAllConnectors();

  await initConnectorRuntime();

  await startScheduler();
  startMeetingDetection();
  await syncAllAutomationSchedules();

  log.info('server initialized');
}
