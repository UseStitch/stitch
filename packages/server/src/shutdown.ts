import { stopTokenRefreshService } from '@/connectors/auth/token-refresh.js';
import { shutdownConnectorRuntime } from '@/connectors/runtime.js';
import * as Log from '@/lib/log.js';
import * as Scheduler from '@/lib/scheduler.js';

const log = Log.create({ service: 'shutdown' });

async function shutdown(signal: string) {
  log.info({ signal }, 'shutting down');
  stopTokenRefreshService();
  await shutdownConnectorRuntime();
  Scheduler.cancelAll();
  process.exit(0);
}

export function registerShutdownHandlers() {
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}
