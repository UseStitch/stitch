import * as React from 'react';

import type {
  SseEventName,
  SseEventPayloadMap,
  SseHandlers,
  UseSseResult,
} from '@stitch/shared/chat/realtime';

type SseContextValue = {
  isConnected: boolean;
  lastHeartbeat: Date | null;
  subscribe: (handlers: SseHandlers) => () => void;
};

const SseContext = React.createContext<SseContextValue | null>(null);

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function parseEventData<K extends SseEventName>(eventName: K, raw: string): SseEventPayloadMap[K] {
  if (eventName === 'heartbeat') {
    return { ts: Date.now() } as SseEventPayloadMap[K];
  }

  return parseJson(raw) as SseEventPayloadMap[K];
}

function dispatchEvent<K extends SseEventName>(
  handlers: SseHandlers,
  eventName: K,
  payload: SseEventPayloadMap[K],
): void {
  const handler = handlers[eventName] as ((data: SseEventPayloadMap[K]) => void) | undefined;
  handler?.(payload);
}

export function SseProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = React.useState(false);
  const [lastHeartbeat, setLastHeartbeat] = React.useState<Date | null>(null);

  const handlersRef = React.useRef<SseHandlers>({});

  React.useEffect(() => {
    let eventSource: EventSource | null = null;
    let cancelled = false;

    const initEventSource = async () => {
      const { getServerUrl } = await import('@/lib/api');
      const baseUrl = await getServerUrl();

      if (cancelled) return;

      eventSource = new EventSource(`${baseUrl}/events`);

      eventSource.onopen = () => setIsConnected(true);
      eventSource.onerror = () => setIsConnected(false);

      eventSource.addEventListener('heartbeat', () => {
        setLastHeartbeat(new Date());
        handlersRef.current.heartbeat?.({ ts: Date.now() });
      });

      const eventNames: SseEventName[] = [
        'connected',
        'data-change',
        'session-title-update',
        'stream-start',
        'stream-part-update',
        'stream-part-delta',
        'stream-finish',
        'stream-error',
        'stream-retry',
        'stream-tool-state',
        'stream-tool-input-delta',
        'doom-loop-detected',
        'compaction-start',
        'compaction-complete',
        'question-asked',
        'question-replied',
        'question-rejected',
        'permission-response-requested',
        'permission-response-resolved',
      ];

      eventNames.forEach((eventName) => {
        eventSource!.addEventListener(eventName, (e) => {
          dispatchEvent(handlersRef.current, eventName, parseEventData(eventName, e.data));
        });
      });
    };

    initEventSource();

    return () => {
      cancelled = true;
      eventSource?.close();
      setIsConnected(false);
    };
  }, []);

  const subscribe = React.useCallback((handlers: SseHandlers) => {
    handlersRef.current = { ...handlersRef.current, ...handlers };

    return () => {
      const keys = Object.keys(handlers) as SseEventName[];
      keys.forEach((key) => {
        delete handlersRef.current[key];
      });
    };
  }, []);

  return (
    <SseContext.Provider value={{ isConnected, lastHeartbeat, subscribe }}>
      {children}
    </SseContext.Provider>
  );
}

function useSseContext(): SseContextValue {
  const context = React.useContext(SseContext);
  if (!context) {
    throw new Error('useSseContext must be used within an SseProvider');
  }
  return context;
}

export function useSSE(handlers: SseHandlers = {}): UseSseResult {
  const { isConnected, lastHeartbeat, subscribe } = useSseContext();

  React.useEffect(() => {
    return subscribe(handlers);
  }, [subscribe, handlers]);

  return { isConnected, lastHeartbeat };
}
