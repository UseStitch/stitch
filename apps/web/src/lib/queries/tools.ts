import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { ConnectorIconSource } from '@stitch/shared/connectors/types';
import type { ToolPermission, ToolPermissionValue } from '@stitch/shared/permissions/types';
import type { ToolEnabledScope, ToolEnabledState, ToolType } from '@stitch/shared/tools/types';

import { serverRequest } from '@/lib/api';

type KnownTool = { toolType: ToolType; toolName: string; displayName: string };

type KnownMcpTool = {
  name: string;
  displayName: string;
  serverId: string;
  serverName: string;
  serverIconPath?: string;
  toolIconPath?: string;
};

type KnownToolset = {
  id: string;
  name: string;
  description: string;
  icon: ConnectorIconSource | null;
  source: 'native' | 'provider' | 'connector' | 'mcp';
  toolCount: number;
  hasInstructions: boolean;
  promptCount: number;
  tools: { toolName: string; displayName: string }[];
};

export const toolKeys = {
  all: ['tools-config'] as const,
  knownTools: () => [...toolKeys.all, 'known-tools'] as const,
  knownMcpTools: () => [...toolKeys.all, 'known-mcp-tools'] as const,
  knownToolsets: () => [...toolKeys.all, 'known-toolsets'] as const,
  permissions: () => [...toolKeys.all, 'permissions'] as const,
  enabledStates: () => [...toolKeys.all, 'enabled-states'] as const,
};

export const knownToolsQueryOptions = queryOptions({
  queryKey: toolKeys.knownTools(),
  queryFn: async (): Promise<KnownTool[]> => {
    const data = await serverRequest<{ tools: KnownTool[] }>('/config/tools');
    return data.tools;
  },
});

export const knownMcpToolsQueryOptions = queryOptions({
  queryKey: toolKeys.knownMcpTools(),
  queryFn: async (): Promise<KnownMcpTool[]> => {
    const data = await serverRequest<{ tools: KnownMcpTool[] }>('/config/mcp-tools');
    return data.tools;
  },
});

export const knownToolsetsQueryOptions = queryOptions({
  queryKey: toolKeys.knownToolsets(),
  queryFn: async (): Promise<KnownToolset[]> => {
    const data = await serverRequest<{ toolsets: KnownToolset[] }>('/config/toolsets');
    return data.toolsets;
  },
});

export const toolPermissionsQueryOptions = queryOptions({
  queryKey: toolKeys.permissions(),
  queryFn: () => serverRequest<ToolPermission[]>('/config/permissions'),
});

export const toolEnabledStatesQueryOptions = queryOptions({
  queryKey: toolKeys.enabledStates(),
  queryFn: async (): Promise<ToolEnabledState[]> => {
    const data = await serverRequest<{ states: ToolEnabledState[] }>('/config/tools/enabled');
    return data.states;
  },
});

export function useUpsertToolPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { toolName: string; pattern: string | null; permission: ToolPermissionValue }) =>
      serverRequest<void>('/config/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: toolKeys.permissions() });
    },
  });
}

export function useDeleteToolPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (permissionId: string) =>
      serverRequest<void>(`/config/permissions/${permissionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: toolKeys.permissions() });
    },
  });
}

export function useSetToolEnabledState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { scope: ToolEnabledScope; identifier: string; enabled: boolean }) =>
      serverRequest<void>('/config/tools/enabled', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: toolKeys.enabledStates() }),
        queryClient.invalidateQueries({ queryKey: toolKeys.knownTools() }),
        queryClient.invalidateQueries({ queryKey: toolKeys.knownMcpTools() }),
        queryClient.invalidateQueries({ queryKey: toolKeys.knownToolsets() }),
      ]);
    },
  });
}
