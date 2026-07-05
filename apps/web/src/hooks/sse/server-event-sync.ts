import { useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

import type { Session, SessionsPage } from '@stitch/shared/chat/messages';
import type { PartDelta } from '@stitch/shared/chat/stream-events';

import { useSSE } from '@/hooks/sse/sse-context';
import { sessionKeys } from '@/lib/queries/chat';
import { mcpKeys } from '@/lib/queries/mcp';
import { permissionResponseKeys } from '@/lib/queries/permissions';
import { questionKeys } from '@/lib/queries/questions';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { todoKeys } from '@/lib/queries/todos';
import { toolKeys } from '@/lib/queries/tools';
import { playNotificationSound } from '@/lib/sounds';
import { useStreamStore } from '@/stores/stream-store';

type PendingDelta = { sessionId: string; messageId: string; partId: string; delta: PartDelta };

// Helper to mark a session unread in infinite list caches
function markSessionUnread(queryClient: QueryClient, sessionId: string, currentSessionId: string | undefined): void {
  if (sessionId === currentSessionId) return;

  // Update infinite list queries
  queryClient.setQueriesData<InfiniteData<SessionsPage>>(
    { queryKey: sessionKeys.infiniteLists() },
    (prev: InfiniteData<SessionsPage> | undefined) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((page) => ({
          ...page,
          sessions: page.sessions.map((s) => (s.id === sessionId ? { ...s, isUnread: true } : s)),
        })),
      };
    },
  );
}

// Helper to check if sound is enabled
function isSoundEnabled(queryClient: QueryClient): boolean {
  const settings = queryClient.getQueryData<Record<string, string>>(settingsQueryOptions.queryKey);
  return settings?.['notifications.sound.enabled'] !== 'false';
}

function useServerEventSync(): void {
  const queryClient = useQueryClient();
  const params = useParams({ strict: false });
  const currentSessionId = params.id;

  const {
    applyStreamStart,
    applyPartUpdate,
    applyPartDeltas,
    applyToolState,
    finishStream,
    errorStream,
    retryStream,
    doomLoopDetected,
  } = useStreamStore.getState();

  const pendingDeltasRef = useRef<PendingDelta[]>([]);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  function flushPendingDeltas() {
    const batch = pendingDeltasRef.current;
    pendingDeltasRef.current = [];

    const groups = new Map<
      string,
      { sessionId: string; messageId: string; deltas: { partId: string; delta: PartDelta }[] }
    >();
    for (const item of batch) {
      const key = `${item.sessionId}:${item.messageId}`;
      let group = groups.get(key);
      if (!group) {
        group = { sessionId: item.sessionId, messageId: item.messageId, deltas: [] };
        groups.set(key, group);
      }
      group.deltas.push({ partId: item.partId, delta: item.delta });
    }

    for (const group of groups.values()) {
      applyPartDeltas(group.sessionId, group.messageId, group.deltas);
    }
  }

  useSSE({
    // Stream Events
    'stream-start': ({ sessionId, messageId }) => {
      applyStreamStart(sessionId, messageId);
    },
    'stream-part-update': ({ sessionId, messageId, partId, part }) => {
      applyPartUpdate(sessionId, messageId, partId, part);
    },
    'stream-part-delta': ({ sessionId, messageId, partId, delta }) => {
      pendingDeltasRef.current.push({ sessionId, messageId, partId, delta });

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          flushPendingDeltas();
        });
      }
    },
    'stream-tool-state': ({ sessionId, messageId, toolCallId, toolName, status, input, output, error }) => {
      applyToolState(sessionId, messageId, toolCallId, toolName, status, input, output, error);
    },
    'stream-finish': ({ sessionId, messageId, finishReason, usage }) => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
        flushPendingDeltas();
      }
      finishStream(sessionId, messageId, finishReason, usage);

      void Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionKeys.messages(sessionId) }),
        queryClient.invalidateQueries({ queryKey: sessionKeys.stats(sessionId) }),
      ]).then(() => {
        useStreamStore.getState().resetSession(sessionId);
      });
    },
    'stream-error': ({ sessionId, messageId, error, details }) => {
      errorStream(sessionId, messageId, error, details);
    },
    'stream-retry': ({ sessionId, messageId, attempt, maxRetries, delayMs, message }) => {
      retryStream(sessionId, messageId, { attempt, maxRetries, delayMs, message, nextRetryAt: Date.now() + delayMs });
    },
    'doom-loop-detected': ({ sessionId, messageId, toolName, consecutiveCount }) => {
      doomLoopDetected(sessionId, messageId, toolName, consecutiveCount);
    },

    // Recording Events
    'recording-started': () => {
      void queryClient.invalidateQueries({ queryKey: ['recordings', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['recordings', 'detail'] });
      void queryClient.invalidateQueries({ queryKey: ['recordings', 'active'] });
    },
    'recording-stopped': () => {
      void queryClient.invalidateQueries({ queryKey: ['recordings', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['recordings', 'detail'] });
      void queryClient.invalidateQueries({ queryKey: ['recordings', 'active'] });
    },
    'recording-analysis-updated': ({ recordingId }) => {
      void queryClient.invalidateQueries({ queryKey: ['recordings', 'detail', recordingId] });
    },

    // Session Events
    'session-title-update': ({ sessionId, title }) => {
      queryClient.setQueriesData<InfiniteData<SessionsPage>>(
        { queryKey: sessionKeys.infiniteLists() },
        (prev: InfiniteData<SessionsPage> | undefined) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              sessions: page.sessions.map((s) => (s.id === sessionId ? { ...s, title } : s)),
            })),
          };
        },
      );
      queryClient.setQueryData<Session>(sessionKeys.detail(sessionId), (prev: Session | undefined) =>
        prev ? { ...prev, title } : prev,
      );
    },
    'session-todos-updated': ({ sessionId }) => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.list(sessionId) });
    },
    'compaction-complete': ({ sessionId }) => {
      void queryClient.resetQueries({ queryKey: sessionKeys.messages(sessionId) });
    },

    // Question Events
    'question-asked': ({ question }) => {
      void queryClient.invalidateQueries({ queryKey: questionKeys.list(question.sessionId) });
      markSessionUnread(queryClient, question.sessionId, currentSessionId);
      if (isSoundEnabled(queryClient)) playNotificationSound();
    },
    'question-replied': ({ sessionId }) => {
      void queryClient.invalidateQueries({ queryKey: questionKeys.list(sessionId) });
    },
    'question-rejected': ({ sessionId }) => {
      void queryClient.invalidateQueries({ queryKey: questionKeys.list(sessionId) });
    },

    // Permission Events
    'permission-response-requested': ({ permissionResponse }) => {
      void queryClient.invalidateQueries({ queryKey: permissionResponseKeys.list(permissionResponse.sessionId) });
      markSessionUnread(queryClient, permissionResponse.sessionId, currentSessionId);
      if (isSoundEnabled(queryClient)) playNotificationSound();
    },
    'permission-response-resolved': ({ sessionId }) => {
      void queryClient.invalidateQueries({ queryKey: permissionResponseKeys.list(sessionId) });
    },

    // MCP Events
    'mcp-tools-changed': ({ serverId }) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: mcpKeys.tools(serverId) }),
        queryClient.invalidateQueries({ queryKey: toolKeys.knownTools() }),
        queryClient.invalidateQueries({ queryKey: toolKeys.knownMcpTools() }),
        queryClient.invalidateQueries({ queryKey: toolKeys.knownToolsets() }),
      ]);
    },
    'mcp-auth-status-changed': () => {
      void queryClient.invalidateQueries({ queryKey: mcpKeys.list() });
    },
  });
}

export function ServerEventSync(): null {
  useServerEventSync();
  return null;
}
