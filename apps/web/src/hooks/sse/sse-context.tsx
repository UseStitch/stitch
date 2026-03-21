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

type AnyHandler = (data: SseEventPayloadMap[SseEventName]) => void;

export function SseProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = React.useState(false);
  const [lastHeartbeat, setLastHeartbeat] = React.useState<Date | null>(null);

  // Map from event name → set of handlers so multiple subscribers can coexist per event.
  const handlersRef = React.useRef<Map<SseEventName, Set<AnyHandler>>>(new Map());

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
        handlersRef.current.get('heartbeat')?.forEach((h) => h({ ts: Date.now() }));
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
          const payload = parseEventData(eventName, e.data);
          handlersRef.current.get(eventName)?.forEach((h) => h(payload as never));
        });
      });
    };

    void initEventSource();

    return () => {
      cancelled = true;
      eventSource?.close();
      setIsConnected(false);
    };
  }, []);

  const subscribe = React.useCallback((handlers: SseHandlers) => {
    const entries = Object.entries(handlers) as [SseEventName, AnyHandler][];

    entries.forEach(([eventName, handler]) => {
      if (!handlersRef.current.has(eventName)) {
        handlersRef.current.set(eventName, new Set());
      }
      handlersRef.current.get(eventName)!.add(handler);
    });

    return () => {
      entries.forEach(([eventName, handler]) => {
        handlersRef.current.get(eventName)?.delete(handler);
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

  // Stable ref so the subscribe effect only runs once per mount, not on every render.
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;

  React.useEffect(() => {
    // Wrap each handler in a stable indirection so the Set entry identity is stable,
    // but the call always dispatches through the latest ref value.
    const stableHandlers = Object.fromEntries(
      Object.keys(handlersRef.current).map((key) => [
        key,
        (data: unknown) => {
          const h = handlersRef.current[key as SseEventName] as AnyHandler | undefined;
          h?.(data as never);
        },
      ]),
    ) as SseHandlers;

    return subscribe(stableHandlers);
    // subscribe is stable (useCallback [] deps), so this runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe]);

  return { isConnected, lastHeartbeat };
}
