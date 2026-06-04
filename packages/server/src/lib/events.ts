import type { RecordingAudioChunkPayload, SseEventPayloadMap } from '@stitch/shared/chat/realtime';

type InternalEventPayloadMap = SseEventPayloadMap & {
  'recording-audio-chunk': RecordingAudioChunkPayload;
};

type InternalEventName = keyof InternalEventPayloadMap;

type Listener<K extends InternalEventName> = (data: InternalEventPayloadMap[K]) => void;

const listeners = new Map<InternalEventName, Set<Listener<InternalEventName>>>();

export function on<K extends InternalEventName>(event: K, listener: Listener<K>): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
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
