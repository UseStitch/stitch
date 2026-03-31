import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { ToolPermission, ToolPermissionValue } from '@stitch/shared/permissions/types';
import type { ToolType } from '@stitch/shared/tools/types';

import { serverFetch } from '@/lib/api';

type KnownTool = {
  toolType: ToolType;
  toolName: string;
  displayName: string;
};

type KnownMcpTool = {
  name: string;
  displayName: string;
  serverId: string;
  serverName: string;
  serverIconPath?: string;
  toolIconPath?: string;
};

export const toolKeys = {
  all: ['tools-config'] as const,
  knownTools: () => [...toolKeys.all, 'known-tools'] as const,
  knownMcpTools: () => [...toolKeys.all, 'known-mcp-tools'] as const,
  permissions: () => [...toolKeys.all, 'permissions'] as const,
};

export const knownToolsQueryOptions = queryOptions({
  queryKey: toolKeys.knownTools(),
  staleTime: Infinity,
  queryFn: async (): Promise<KnownTool[]> => {
    const res = await serverFetch('/config/tools');
    if (!res.ok) throw new Error('Failed to fetch tools');
    const data = (await res.json()) as { tools: KnownTool[] };
    return data.tools;
  },
});

export const knownMcpToolsQueryOptions = queryOptions({
  queryKey: toolKeys.knownMcpTools(),
  staleTime: Infinity,
  queryFn: async (): Promise<KnownMcpTool[]> => {
    const res = await serverFetch('/config/mcp-tools');
    if (!res.ok) throw new Error('Failed to fetch MCP tools');
    const data = (await res.json()) as { tools: KnownMcpTool[] };
    return data.tools;
  },
});

export const toolPermissionsQueryOptions = queryOptions({
  queryKey: toolKeys.permissions(),
  staleTime: Infinity,
  queryFn: async (): Promise<ToolPermission[]> => {
    const res = await serverFetch('/config/permissions');
    if (!res.ok) throw new Error('Failed to fetch permissions');
    return res.json() as Promise<ToolPermission[]>;
  },
});

export function useUpsertToolPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      toolName: string;
      pattern: string | null;
      permission: ToolPermissionValue;
    }) => {
      const res = await serverFetch('/config/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update permission');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: toolKeys.permissions() });
    },
  });
}

export function useDeleteToolPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (permissionId: string) => {
      const res = await serverFetch(`/config/permissions/${permissionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete permission');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: toolKeys.permissions() });
    },
  });
}
