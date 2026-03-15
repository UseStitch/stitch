import * as React from 'react';

import type { SseEventName, SseHandlers, UseSseResult } from '@openwork/shared';

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
      ];

      eventNames.forEach((eventName) => {
        eventSource!.addEventListener(eventName, (e) => {
          handlersRef.current[eventName]?.(parseJson(e.data));
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
