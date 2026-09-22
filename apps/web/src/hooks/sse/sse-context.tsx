import * as React from 'react';
import { z } from 'zod';

import {
  type SseConnectionStatus,
  type SseEventName,
  type SseEventPayloadMap,
  type SseHandlers,
  type UseSseResult,
} from '@stitch/shared/realtime';

import { createSseConnection } from './sse-connection';

import { getServerUrl } from '@/lib/api';

const jsonMessageSchema = z
  .string()
  .transform((raw, context) => {
    try {
      return JSON.parse(raw);
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid JSON SSE payload' });
      return z.NEVER;
    }
  })
  .pipe(z.json());

const sessionIdSchema = z.object({ sessionId: z.string() });
const questionSessionSchema = z.object({ question: sessionIdSchema });
const permissionSessionSchema = z.object({ permissionResponse: sessionIdSchema });
const elicitationSessionSchema = z.object({ elicitation: sessionIdSchema });
const recordingIdSchema = z.object({ recordingId: z.string() });

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
  status: SseConnectionStatus;
  lastHeartbeat: Date | null;
  subscribe: <T extends SseHandlers>(
    handlers: T,
    shouldHandle?: (eventName: SseEventName, payload: SseEventPayloadMap[SseEventName]) => boolean,
  ) => () => void;
};

type SseSubscription = {
  handlers: SseHandlers;
  shouldHandle?: (eventName: SseEventName, payload: SseEventPayloadMap[SseEventName]) => boolean;
};

const SseContext = React.createContext<SseContextValue | null>(null);

function parsePayload<K extends SseEventName>(raw: string): SseEventPayloadMap[K] | null {
  const json = jsonMessageSchema.safeParse(raw);
  if (!json.success) return null;

  const payload = z.custom<SseEventPayloadMap[K]>().safeParse(json.data);
  return payload.success ? payload.data : null;
}

function dispatchEvent<K extends SseEventName>(
  handlers: SseHandlers,
  eventName: K,
  payload: SseEventPayloadMap[K],
): void {
  const handler = handlers[eventName];
  if (handler) handler(payload);
}

function getSessionIdFromPayload(payload: SseEventPayloadMap[SseEventName]): string | null {
  return (
    sessionIdSchema.safeParse(payload).data?.sessionId ??
    questionSessionSchema.safeParse(payload).data?.question.sessionId ??
    permissionSessionSchema.safeParse(payload).data?.permissionResponse.sessionId ??
    elicitationSessionSchema.safeParse(payload).data?.elicitation.sessionId ??
    null
  );
}

function getRecordingIdFromPayload(payload: SseEventPayloadMap[SseEventName]): string | null {
  return recordingIdSchema.safeParse(payload).data?.recordingId ?? null;
}

export function SseProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<SseConnectionStatus>('connecting');
  const [lastHeartbeat, setLastHeartbeat] = React.useState<Date | null>(null);

  const handlersRef = React.useRef<Set<SseSubscription>>(new Set());

  React.useEffect(() => {
    const connection = createSseConnection({
      getUrl: getServerUrl,
      onStatus: setStatus,
      onEvent: (eventName, raw) => {
        // Stamped on arrival rather than from the server's `ts`, so the value stays
        // meaningful for remote servers whose clock is skewed from the client's.
        if (eventName === 'heartbeat') setLastHeartbeat(new Date());

        const payload = parsePayload(raw);
        if (payload) {
          handlersRef.current.forEach(({ handlers, shouldHandle }) => {
            if (!shouldHandle || shouldHandle(eventName, payload)) dispatchEvent(handlers, eventName, payload);
          });
        }
      },
    });

    // On wake or network recovery, re-check liveness immediately instead of
    // waiting for the next watchdog tick.
    const poke = () => connection.poke();
    const reconnect = () => connection.reconnect();

    document.addEventListener('visibilitychange', poke);
    window.addEventListener('online', poke);
    window.addEventListener('server-config-changed', reconnect);

    return () => {
      document.removeEventListener('visibilitychange', poke);
      window.removeEventListener('online', poke);
      window.removeEventListener('server-config-changed', reconnect);
      connection.close();
    };
  }, []);

  const subscribe = React.useCallback(
    <T extends SseHandlers>(handlers: T, shouldHandle?: SseSubscription['shouldHandle']) => {
      const subscription = { handlers, shouldHandle };
      handlersRef.current.add(subscription);

      return () => {
        handlersRef.current.delete(subscription);
      };
    },
    [],
  );

  const value = React.useMemo(() => ({ status, lastHeartbeat, subscribe }), [status, lastHeartbeat, subscribe]);

  return <SseContext.Provider value={value}>{children}</SseContext.Provider>;
}

function useSseContext(): SseContextValue {
  const context = React.useContext(SseContext);
  if (!context) {
    throw new Error('useSseContext must be used within an SseProvider');
  }
  return context;
}

export function useSSE(handlers: SseHandlers = {}): UseSseResult {
  const { status, lastHeartbeat, subscribe } = useSseContext();

  React.useEffect(() => {
    return subscribe(handlers);
  }, [subscribe, handlers]);

  return { status, lastHeartbeat };
}

export function useSessionEvents(
  sessionId: string,
  handlers: { [K in SessionScopedName]?: (data: SseEventPayloadMap[K]) => void },
): void {
  const { subscribe } = useSseContext();

  React.useEffect(() => {
    return subscribe(handlers, (_eventName, payload) => getSessionIdFromPayload(payload) === sessionId);
  }, [subscribe, sessionId, handlers]);
}

export function useRecordingEvents(
  recordingId: string | null,
  handlers: { [K in RecordingScopedName]?: (data: SseEventPayloadMap[K]) => void },
): void {
  const { subscribe } = useSseContext();

  React.useEffect(() => {
    return subscribe(handlers, (_eventName, payload) => getRecordingIdFromPayload(payload) === recordingId);
  }, [subscribe, recordingId, handlers]);
}
