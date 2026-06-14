import type { SseEventPayloadMap } from '@stitch/shared/realtime';

type InternalEventPayloadMap = SseEventPayloadMap;

type InternalEventName = keyof InternalEventPayloadMap;

type Listener<K extends InternalEventName> = (data: InternalEventPayloadMap[K]) => void;

const listeners = new Map<InternalEventName, Set<Listener<InternalEventName>>>();

export function on<K extends InternalEventName>(event: K, listener: Listener<K>): () => void {
  let existing = listeners.get(event);
  if (!existing) {
    existing = new Set();
    listeners.set(event, existing);
  }
  const set = existing;
  set.add(listener as Listener<InternalEventName>);
  return () => {
    set.delete(listener as Listener<InternalEventName>);
  };
}

export function emit<K extends InternalEventName>(
  event: K,
  data: InternalEventPayloadMap[K],
): void {
  const set = listeners.get(event);
  if (!set) return;
  for (const listener of set) {
    listener(data);
  }
}
