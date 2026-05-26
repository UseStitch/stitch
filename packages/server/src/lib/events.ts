import type { SseEventName, SseEventPayloadMap } from '@stitch/shared/chat/realtime';

type Listener<K extends SseEventName> = (data: SseEventPayloadMap[K]) => void;

const listeners = new Map<SseEventName, Set<Listener<SseEventName>>>();

export function on<K extends SseEventName>(event: K, listener: Listener<K>): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  set.add(listener as Listener<SseEventName>);
  return () => {
    set.delete(listener as Listener<SseEventName>);
  };
}

export function emit<K extends SseEventName>(event: K, data: SseEventPayloadMap[K]): void {
  const set = listeners.get(event);
  if (!set) return;
  for (const listener of set) {
    listener(data);
  }
}
