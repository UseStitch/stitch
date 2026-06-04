import { shutdownConnectorRuntime } from '@/connectors/runtime.js';
import { closeDb } from '@/db/client.js';
import * as Log from '@/lib/log.js';
import { stopRecording } from '@/recordings/service.js';
import { stopScheduler } from '@/scheduler/runtime.js';

const log = Log.create({ service: 'shutdown' });

async function shutdown(signal: string) {
  log.info({ signal }, 'shutting down');
  await stopScheduler();
  await stopRecording({ durationMs: null, fileSizeBytes: null }).catch((error) => {
    log.warn({ error }, 'failed to stop recording during shutdown');
  });
  await shutdownConnectorRuntime();
  closeDb();
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
