import * as React from 'react';

import {
  SSE_EVENT_NAMES,
  type SseEventName,
  type SseEventPayloadMap,
  type SseHandlers,
  type UseSseResult,
} from '@stitch/shared/realtime';

type SessionScopedName = {
  [K in SseEventName]: SseEventPayloadMap[K] extends { sessionId: string }
    ? K
    : SseEventPayloadMap[K] extends { question: { sessionId: string } }
      ? K
      : SseEventPayloadMap[K] extends { permissionResponse: { sessionId: string } }
        ? K
        : never;
}[SseEventName];

type RecordingScopedName = {
  [K in SseEventName]: SseEventPayloadMap[K] extends { recordingId: string } ? K : never;
}[SseEventName];

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

// Heartbeat uses runtime fallback to Date.now() for connection health monitoring
function parseEventData<K extends SseEventName>(eventName: K, raw: string): SseEventPayloadMap[K] {
  if (eventName === 'heartbeat') {
    const parsed = parseJson(raw);

    if (typeof parsed === 'object' && parsed && 'ts' in parsed && typeof parsed.ts === 'number') {
      return { ts: parsed.ts } as SseEventPayloadMap[K];
    }

    return { ts: Date.now() } as SseEventPayloadMap[K];
  }

  return parseJson(raw) as SseEventPayloadMap[K];
}

type AnyHandler = (data: never) => void;

function getSessionIdFromPayload(eventName: SseEventName, payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  if ('sessionId' in payload && typeof payload.sessionId === 'string') {
    return payload.sessionId;
  }

  if (
    eventName === 'question-asked' &&
    'question' in payload &&
    payload.question &&
    typeof payload.question === 'object' &&
    'sessionId' in payload.question &&
    typeof payload.question.sessionId === 'string'
  ) {
    return payload.question.sessionId;
  }

  if (
    eventName === 'permission-response-requested' &&
    'permissionResponse' in payload &&
    payload.permissionResponse &&
    typeof payload.permissionResponse === 'object' &&
    'sessionId' in payload.permissionResponse &&
    typeof payload.permissionResponse.sessionId === 'string'
  ) {
    return payload.permissionResponse.sessionId;
  }

  return null;
}

function getRecordingIdFromPayload(eventName: SseEventName, payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  if ('recordingId' in payload && typeof payload.recordingId === 'string') {
    return payload.recordingId;
  }

  return null;
}

export function SseProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = React.useState(false);
  const [lastHeartbeat, setLastHeartbeat] = React.useState<Date | null>(null);
  const [connectionVersion, setConnectionVersion] = React.useState(0);

  // Map from event name → set of handlers so multiple subscribers can coexist per event.
  const handlersRef = React.useRef<Map<SseEventName, Set<AnyHandler>>>(new Map());

  React.useEffect(() => {
    const reconnect = () => setConnectionVersion((version) => version + 1);
    window.addEventListener('server-config-changed', reconnect);
    return () => window.removeEventListener('server-config-changed', reconnect);
  }, []);

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

      SSE_EVENT_NAMES.forEach((eventName) => {
        eventSource!.addEventListener(eventName, (e) => {
          if (eventName === 'heartbeat') {
            const payload = parseEventData('heartbeat', e.data);
            setLastHeartbeat(new Date(payload.ts));
            handlersRef.current.get('heartbeat')?.forEach((h) => h(payload as never));
            return;
          }

          const payload = parseEventData(eventName, e.data);
          const castedPayload = payload as never;
          handlersRef.current.get(eventName)?.forEach((h) => h(castedPayload));
        });
      });
    };

    void initEventSource();

    return () => {
      cancelled = true;
      eventSource?.close();
      setIsConnected(false);
    };
  }, [connectionVersion]);

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

  // Capture event names on mount for stable useEffect dependencies
  const [eventNames] = React.useState(() => Object.keys(handlers) as SseEventName[]);

  React.useEffect(() => {
    // Wrap each handler in a stable indirection so the Set entry identity is stable,
    // but the call always dispatches through the latest ref value.
    const stableHandlers = Object.fromEntries(
      eventNames.map((key) => [
        key,
        (data: unknown) => {
          const h = handlersRef.current[key] as AnyHandler | undefined;
          h?.(data as never);
        },
      ]),
    ) as SseHandlers;

    return subscribe(stableHandlers);
  }, [subscribe, eventNames]);

  return { isConnected, lastHeartbeat };
}

export function useSessionEvents(
  sessionId: string,
  handlers: { [K in SessionScopedName]?: (data: SseEventPayloadMap[K]) => void },
): void {
  const { subscribe } = useSseContext();

  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;

  const sessionIdRef = React.useRef(sessionId);
  sessionIdRef.current = sessionId;

  const [eventNames] = React.useState(() => Object.keys(handlers) as SessionScopedName[]);

  React.useEffect(() => {
    const stableHandlers = Object.fromEntries(
      eventNames.map((eventName) => [
        eventName,
        (payload: unknown) => {
          const currentSessionId = sessionIdRef.current;
          const payloadSessionId = getSessionIdFromPayload(eventName, payload);
          if (payloadSessionId === currentSessionId) {
            const h = handlersRef.current[eventName] as AnyHandler | undefined;
            h?.(payload as never);
          }
        },
      ]),
    ) as SseHandlers;

    return subscribe(stableHandlers);
  }, [subscribe, eventNames]);
}

export function useRecordingEvents(
  recordingId: string | null,
  handlers: { [K in RecordingScopedName]?: (data: SseEventPayloadMap[K]) => void },
): void {
  const { subscribe } = useSseContext();

  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;

  const recordingIdRef = React.useRef(recordingId);
  recordingIdRef.current = recordingId;

  const [eventNames] = React.useState(() => Object.keys(handlers) as RecordingScopedName[]);

  React.useEffect(() => {
    const stableHandlers = Object.fromEntries(
      eventNames.map((eventName) => [
        eventName,
        (payload: unknown) => {
          const currentRecordingId = recordingIdRef.current;
          if (!currentRecordingId) return;

          const payloadRecordingId = getRecordingIdFromPayload(eventName, payload);
          if (payloadRecordingId === currentRecordingId) {
            const h = handlersRef.current[eventName] as AnyHandler | undefined;
            h?.(payload as never);
          }
        },
      ]),
    ) as SseHandlers;

    return subscribe(stableHandlers);
  }, [subscribe, eventNames]);
}
