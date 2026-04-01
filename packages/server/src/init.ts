import { registerAllConnectors } from '@/connectors/definitions/index.js';
import { startTokenRefreshService } from '@/connectors/auth/token-refresh.js';
import { registerGoogleToolsets } from '@/connectors/google-toolsets.js';
import { initDb } from '@/db/client.js';
import * as Log from '@/lib/log.js';
import * as Scheduler from '@/lib/scheduler.js';
import { refreshMcpToolsets } from '@/mcp/tool-executor.js';
import { initMeetingService } from '@/meeting/service.js';
import { recoverStaleTranscriptions } from '@/meeting/transcription-service.js';
import * as ModelsDev from '@/provider/models.js';
import { registerProviderToolsets } from '@/tools/providers/index.js';
import * as ToolTruncation from '@/tools/runtime/truncation.js';

const log = Log.create({ service: 'init' });

const HOUR_MS = 60 * 60 * 1000;

const LOG_CLEANUP_INTERVAL_MS = 24 * HOUR_MS;
const MODELS_REFRESH_INTERVAL_MS = 1 * HOUR_MS;
const TOOL_OUTPUT_CLEANUP_INTERVAL_MS = 1 * HOUR_MS;
const MCP_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export async function init() {
  await Log.init({ print: false });

  await initDb();
  await recoverStaleTranscriptions();

  await initMeetingService();

  // Register all toolsets (built-in providers + MCP servers)
  registerProviderToolsets();
  await refreshMcpToolsets();

  // Register connector definitions and start token refresh
  registerAllConnectors();
  startTokenRefreshService();

  // Register Google toolsets based on connected instances and scopes
  await registerGoogleToolsets();

  Scheduler.scheduleRecurring('log-cleanup', LOG_CLEANUP_INTERVAL_MS, () => Log.cleanup());

  Scheduler.scheduleRecurring(
    'models-refresh',
    MODELS_REFRESH_INTERVAL_MS,
    () => ModelsDev.refresh(),
    { immediate: true },
  );

  Scheduler.scheduleRecurring('tool-output-cleanup', TOOL_OUTPUT_CLEANUP_INTERVAL_MS, () =>
    ToolTruncation.cleanup(),
  );

  Scheduler.scheduleRecurring('mcp-refresh', MCP_REFRESH_INTERVAL_MS, () =>
    refreshMcpToolsets({ refreshTools: true }),
  );

  log.info('server initialized');
}
