import { syncAllAutomationSchedules } from '@/automations/scheduler.js';
import { registerAllConnectors } from '@/connectors/definitions/index.js';
import { initConnectorRuntime } from '@/connectors/runtime.js';
import { getDb, initDb } from '@/db/client.js';
import { runPendingMigrations } from '@/db/lance-migrations.js';
import * as Log from '@/lib/log.js';
import { refreshMcpToolsets } from '@/mcp/tool-executor.js';
import { startMeetingDetection } from '@/recordings/meeting-detection.js';
import { startScheduler } from '@/scheduler/runtime.js';
import { createAgendaToolset } from '@/tools/core/agenda.js';
import { createRecordingsToolset } from '@/tools/core/recordings.js';
import { createSessionHistoryToolset } from '@/tools/core/session-history.js';
import { registerProviderToolsets } from '@/tools/providers/index.js';
import { registerToolset } from '@/tools/toolsets/registry.js';

const log = Log.create({ service: 'init' });

export async function init() {
  await Log.init({ print: false });

  await initDb();
  await runPendingMigrations(getDb());

  // Register all toolsets (built-in providers + MCP servers + agenda)
  registerProviderToolsets();
  registerToolset(createAgendaToolset());
  registerToolset(createSessionHistoryToolset());
  registerToolset(createRecordingsToolset());
  await refreshMcpToolsets();

  // Register connector definitions and start token refresh
  registerAllConnectors();

  await initConnectorRuntime();

  await startScheduler();
  startMeetingDetection();
  await syncAllAutomationSchedules();

  log.info('server initialized');
}
