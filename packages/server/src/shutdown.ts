import { stopTokenRefreshService } from '@/connectors/auth/token-refresh.js';
import * as Log from '@/lib/log.js';
import * as Scheduler from '@/lib/scheduler.js';

const log = Log.create({ service: 'shutdown' });

function shutdown(signal: string) {
  log.info({ signal }, 'shutting down');
  stopTokenRefreshService();
  Scheduler.cancelAll();
  process.exit(0);
}

export function registerShutdownHandlers() {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
