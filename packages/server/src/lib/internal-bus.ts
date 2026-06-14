import * as Log from '@/lib/log.js';

import type { InternalEventMap } from './internal-bus-events.js';

const log = Log.create({ service: 'internal-bus' });

type InternalEventName = keyof InternalEventMap;

type AsyncListener<K extends InternalEventName> = (data: InternalEventMap[K]) => Promise<void>;
type SyncListener<K extends InternalEventName> = (data: InternalEventMap[K]) => void;
type WildcardListener = <K extends InternalEventName>(event: K, data: InternalEventMap[K]) => void;

type ListenerEntry<K extends InternalEventName> =
  | { mode: 'sync'; fn: SyncListener<K> }
  | { mode: 'async'; fn: AsyncListener<K> };

class InternalBus {
  private listeners = new Map<InternalEventName, Set<ListenerEntry<InternalEventName>>>();
  private wildcardListeners = new Set<WildcardListener>();

  /**
   * Subscribe to an event asynchronously (fire-and-forget).
   * Errors are logged but do not propagate to the emitter.
   */
  on<K extends InternalEventName>(event: K, listener: AsyncListener<K>): () => void {
    const entry: ListenerEntry<K> = { mode: 'async', fn: listener };
    return this.addListener(event, entry);
  }

  /**
   * Subscribe to an event synchronously (blocks the emit call).
   * Use sparingly — only when downstream MUST complete before the emitter continues.
   */
  onSync<K extends InternalEventName>(event: K, listener: SyncListener<K>): () => void {
    const entry: ListenerEntry<K> = { mode: 'sync', fn: listener };
    return this.addListener(event, entry);
  }

  /**
   * Subscribe to ALL events. Useful for logging/debugging.
   * Always invoked synchronously.
   */
  onAny(listener: WildcardListener): () => void {
    this.wildcardListeners.add(listener);
    return () => {
      this.wildcardListeners.delete(listener);
    };
  }

  /**
   * Emit an event to all subscribers.
   * Sync listeners execute immediately and block.
   * Async listeners are scheduled and errors are caught/logged.
   */
  emit<K extends InternalEventName>(event: K, data: InternalEventMap[K]): void {
    for (const wildcard of this.wildcardListeners) {
      try {
        wildcard(event, data);
      } catch (error) {
        log.warn({ event, error }, 'wildcard listener threw');
      }
    }

    const set = this.listeners.get(event);
    if (!set) return;

    for (const entry of set) {
      if (entry.mode === 'sync') {
        try {
          (entry.fn as SyncListener<K>)(data);
        } catch (error) {
          log.error({ event, error }, 'sync listener threw');
        }
      } else {
        const asyncFn = entry.fn as AsyncListener<K>;
        void asyncFn(data).catch((error) => {
          log.warn({ event, error }, 'async listener failed');
        });
      }
    }
  }

  /** Remove all listeners. Useful for testing teardown. */
  clear(): void {
    this.listeners.clear();
    this.wildcardListeners.clear();
  }

  private addListener<K extends InternalEventName>(
    event: K,
    entry: ListenerEntry<K>,
  ): () => void {
    let existing = this.listeners.get(event);
    if (!existing) {
      existing = new Set();
      this.listeners.set(event, existing);
    }
    const set = existing;
    set.add(entry as ListenerEntry<InternalEventName>);
    return () => {
      set.delete(entry as ListenerEntry<InternalEventName>);
    };
  }
}

/** Singleton bus instance used across the server. */
export const internalBus = new InternalBus();

export type { InternalEventMap, InternalEventName };
