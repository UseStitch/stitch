import { Log } from './lib/log.js';
import { Scheduler } from './lib/scheduler.js';

const log = Log.create({ service: 'shutdown' });

function shutdown(signal: string) {
  log.info('shutting down', { signal });
  Scheduler.cancelAll();
  process.exit(0);
}

export function registerShutdownHandlers() {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
