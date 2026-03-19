import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { PermissionResponse } from '@stitch/shared/permissions/types';

import { serverFetch } from '@/lib/api';

export const permissionResponseKeys = {
  all: ['permission-responses'] as const,
  list: (sessionId: string) => [...permissionResponseKeys.all, 'list', sessionId] as const,
};

export function permissionResponsesQueryOptions(sessionId: string) {
  return queryOptions({
    queryKey: permissionResponseKeys.list(sessionId),
    queryFn: async (): Promise<PermissionResponse[]> => {
      const res = await serverFetch(`/chat/sessions/${sessionId}/permission-responses`);
      if (!res.ok) throw new Error('Failed to fetch permission responses');
      return res.json() as Promise<PermissionResponse[]>;
    },
  });
}

type PermissionBaseInput = {
  sessionId: string;
  permissionResponseId: string;
  setPermission?: {
    permission: 'allow' | 'deny' | 'ask';
    pattern?: string | null;
  };
};

type PermissionAlternativeInput = PermissionBaseInput & {
  entry: string;
};

export function useAllowPermissionResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PermissionBaseInput) => {
      const res = await serverFetch(
        `/chat/sessions/${input.sessionId}/permission-responses/${input.permissionResponseId}/allow`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setPermission: input.setPermission }),
        },
      );
      if (!res.ok) throw new Error('Failed to allow tool');
      return res.json();
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: permissionResponseKeys.list(input.sessionId),
      });
    },
  });
}

export function useRejectPermissionResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PermissionBaseInput) => {
      const res = await serverFetch(
        `/chat/sessions/${input.sessionId}/permission-responses/${input.permissionResponseId}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setPermission: input.setPermission }),
        },
      );
      if (!res.ok) throw new Error('Failed to reject tool');
      return res.json();
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: permissionResponseKeys.list(input.sessionId),
      });
    },
  });
}

export function useAlternativePermissionResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PermissionAlternativeInput) => {
      const res = await serverFetch(
        `/chat/sessions/${input.sessionId}/permission-responses/${input.permissionResponseId}/alternative`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entry: input.entry }),
        },
      );
      if (!res.ok) throw new Error('Failed to submit alternative action');
      return res.json();
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: permissionResponseKeys.list(input.sessionId),
      });
    },
  });
}
