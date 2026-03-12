import * as Log from './lib/log.js';
import * as Scheduler from './lib/scheduler.js';
import * as ModelsDev from './provider/models.js';

const log = Log.create({ service: 'init' });

const HOUR_MS = 60 * 60 * 1000;

const LOG_CLEANUP_INTERVAL_MS = 24 * HOUR_MS;
const MODELS_REFRESH_INTERVAL_MS = 1 * HOUR_MS;

export async function init() {
  await Log.init({ print: process.env.NODE_ENV === 'development' });

  Scheduler.scheduleRecurring('log-cleanup', LOG_CLEANUP_INTERVAL_MS, () => Log.cleanup());

  Scheduler.scheduleRecurring(
    'models-refresh',
    MODELS_REFRESH_INTERVAL_MS,
    () => ModelsDev.refresh(),
    { immediate: true },
  );

  log.info('server initialized');
}
