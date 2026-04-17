import { syncAllAutomationSchedules } from '@/automations/scheduler.js';
import { registerAllConnectors } from '@/connectors/definitions/index.js';
import { initConnectorRuntime } from '@/connectors/runtime.js';
import { getDb, initDb } from '@/db/client.js';
import { runPendingMigrations } from '@/db/lance-migrations.js';
import * as Log from '@/lib/log.js';
import { refreshMcpToolsets } from '@/mcp/tool-executor.js';
import { startMeetingDetection } from '@/recordings/meeting-detection.js';
import { startScheduler } from '@/scheduler/runtime.js';
import { registerDefaultToolsets } from '@/tools/toolsets/register-default-toolsets.js';

const log = Log.create({ service: 'init' });

export async function init() {
  await Log.init({ print: false });

  await initDb();
  await runPendingMigrations(getDb());

  // Register built-in/provider toolsets, then refresh MCP toolsets
  registerDefaultToolsets();
  await refreshMcpToolsets();

  // Register connector definitions and start token refresh
  registerAllConnectors();

  await initConnectorRuntime();

  await startScheduler();
  startMeetingDetection();
  await syncAllAutomationSchedules();

  log.info('server initialized');
}
