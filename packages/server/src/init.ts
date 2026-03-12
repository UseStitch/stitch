import { Log } from './lib/log.js';
import { Scheduler } from './lib/scheduler.js';

const log = Log.create({ service: 'init' });

// 24 hours
const LOG_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function init() {
  await Log.init({ print: process.env.NODE_ENV === 'development' });

  Scheduler.scheduleRecurring('log-cleanup', LOG_CLEANUP_INTERVAL_MS, () =>
    Log.cleanup(),
  );

  log.info('server initialized');
}
