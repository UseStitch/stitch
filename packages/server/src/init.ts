import { initDb } from '@/db/client.js';
import * as Log from '@/lib/log.js';
import * as Scheduler from '@/lib/scheduler.js';
import { initMeetingService } from '@/meeting/service.js';
import { recoverStaleTranscriptions } from '@/meeting/transcription-service.js';
import * as ModelsDev from '@/provider/models.js';
import * as ToolTruncation from '@/tools/runtime/truncation.js';

const log = Log.create({ service: 'init' });

const HOUR_MS = 60 * 60 * 1000;

const LOG_CLEANUP_INTERVAL_MS = 24 * HOUR_MS;
const MODELS_REFRESH_INTERVAL_MS = 1 * HOUR_MS;
const TOOL_OUTPUT_CLEANUP_INTERVAL_MS = 1 * HOUR_MS;

export async function init() {
  await Log.init({ print: false });

  await initDb();
  await recoverStaleTranscriptions();

  await initMeetingService();

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

  log.info('server initialized');
}
