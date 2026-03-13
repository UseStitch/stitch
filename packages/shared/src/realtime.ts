export type SseEventName = 'heartbeat' | 'connected' | 'data-change';

export type SseEvent = {
  event: SseEventName;
  data: string;
};

export type SseHandlers = Partial<Record<SseEventName, (data: unknown) => void>>;

export type UseSseResult = {
  isConnected: boolean;
  lastHeartbeat: Date | null;
};

export type DataChangePayload = {
  queryKey: readonly unknown[];
};
