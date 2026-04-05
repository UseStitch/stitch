import { shutdownConnectorRuntime } from '@/connectors/runtime.js';
import * as Log from '@/lib/log.js';
import { stopScheduler } from '@/scheduler/runtime.js';

const log = Log.create({ service: 'shutdown' });

async function shutdown(signal: string) {
  log.info({ signal }, 'shutting down');
  await stopScheduler();
  await shutdownConnectorRuntime();
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
