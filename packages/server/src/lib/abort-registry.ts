import type { PrefixedString } from '@stitch/shared/id';

import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'abort-registry' });

const registry = new Map<PrefixedString<'ses'>, AbortController>();

export function register(sessionId: PrefixedString<'ses'>): AbortSignal {
  const existing = registry.get(sessionId);
  if (existing) {
    log.warn(
      { event: 'stream.abort.registry_reregister', sessionId },
      'aborting existing controller before re-registering',
    );
    existing.abort();
  }

  const controller = new AbortController();
  registry.set(sessionId, controller);
  return controller.signal;
}

export function abort(sessionId: PrefixedString<'ses'>): void {
  const controller = registry.get(sessionId);
  if (!controller) return;
  log.info({ event: 'stream.abort.registry_abort', sessionId }, 'aborting session');
  controller.abort();
  registry.delete(sessionId);
}

export function cleanup(sessionId: PrefixedString<'ses'>): void {
  registry.delete(sessionId);
}
