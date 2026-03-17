import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'abort-registry' });

const registry = new Map<string, AbortController>();

export function register(sessionId: string): AbortSignal {
  const existing = registry.get(sessionId);
  if (existing) {
    log.warn('aborting existing controller before re-registering', {
      event: 'stream.abort.registry_reregister',
      sessionId,
    });
    existing.abort();
  }

  const controller = new AbortController();
  registry.set(sessionId, controller);
  return controller.signal;
}

export function abort(sessionId: string): void {
  const controller = registry.get(sessionId);
  if (!controller) return;
  log.info('aborting session', { event: 'stream.abort.registry_abort', sessionId });
  controller.abort();
  registry.delete(sessionId);
}

export function cleanup(sessionId: string): void {
  registry.delete(sessionId);
}
