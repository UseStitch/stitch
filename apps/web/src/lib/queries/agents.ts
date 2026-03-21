import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { Agent, AgentToolEntry, AgentToolType } from '@stitch/shared/agents/types';
import type { McpServer } from '@stitch/shared/mcp/types';
import type { AgentPermission, AgentPermissionValue } from '@stitch/shared/permissions/types';

import { serverFetch } from '@/lib/api';
import { settingsQueryOptions, saveSettingMutationOptions } from '@/lib/queries/settings';

const agentKeys = {
  all: ['agents'] as const,
  list: () => [...agentKeys.all, 'list'] as const,
  toolConfig: (agentId: string) => [...agentKeys.all, 'tool-config', agentId] as const,
  mcpServers: (agentId: string) => [...agentKeys.all, 'mcp-servers', agentId] as const,
  permissions: (agentId: string) => [...agentKeys.all, 'permissions', agentId] as const,
};

export const agentsQueryOptions = queryOptions({
  queryKey: agentKeys.list(),
  staleTime: Infinity,
  queryFn: async (): Promise<Agent[]> => {
    const res = await serverFetch('/agents');
    if (!res.ok) throw new Error('Failed to fetch agents');
    return res.json() as Promise<Agent[]>;
  },
});

export function agentToolConfigQueryOptions(agentId: string) {
  return queryOptions({
    queryKey: agentKeys.toolConfig(agentId),
    staleTime: Infinity,
    queryFn: async (): Promise<AgentToolEntry[]> => {
      const res = await serverFetch(`/agents/${agentId}/tool-config`);
      if (!res.ok) throw new Error('Failed to fetch agent tool config');
      const data = (await res.json()) as { tools: AgentToolEntry[] };
      return data.tools;
    },
  });
}

export function useSetAgentToolEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      agentId: string;
      toolType: AgentToolType;
      toolName: string;
      enabled: boolean;
    }) => {
      const res = await serverFetch(`/agents/${input.agentId}/tool-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolType: input.toolType,
          toolName: input.toolName,
          enabled: input.enabled,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update tool config');
      }
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.toolConfig(input.agentId) });
    },
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      useBasePrompt: boolean;
      systemPrompt: string | null;
    }): Promise<{ id: string }> => {
      const res = await serverFetch('/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to create agent');
      }

      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      useBasePrompt?: boolean;
      systemPrompt?: string | null;
    }) => {
      const res = await serverFetch(`/agents/${input.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name,
          useBasePrompt: input.useBasePrompt,
          systemPrompt: input.systemPrompt,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update agent');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await serverFetch(`/agents/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete agent');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}

export function useSetDefaultAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    ...saveSettingMutationOptions('agent.default', queryClient, { silent: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsQueryOptions.queryKey });
    },
  });
}

export function agentMcpServersQueryOptions(agentId: string) {
  return queryOptions({
    queryKey: agentKeys.mcpServers(agentId),
    staleTime: Infinity,
    queryFn: async (): Promise<McpServer[]> => {
      const res = await serverFetch(`/agents/${agentId}/mcp-servers`);
      if (!res.ok) throw new Error('Failed to fetch agent MCP servers');
      return res.json() as Promise<McpServer[]>;
    },
  });
}

export function useAddMcpServerToAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { agentId: string; mcpServerId: string }) => {
      const res = await serverFetch(`/agents/${input.agentId}/mcp-servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcpServerId: input.mcpServerId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to add MCP server to agent');
      }
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.mcpServers(input.agentId) });
      void queryClient.invalidateQueries({ queryKey: agentKeys.toolConfig(input.agentId) });
    },
  });
}

export function useRemoveMcpServerFromAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { agentId: string; mcpServerId: string }) => {
      const res = await serverFetch(`/agents/${input.agentId}/mcp-servers/${input.mcpServerId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to remove MCP server from agent');
      }
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.mcpServers(input.agentId) });
      void queryClient.invalidateQueries({ queryKey: agentKeys.toolConfig(input.agentId) });
    },
  });
}

export function agentPermissionsQueryOptions(agentId: string) {
  return queryOptions({
    queryKey: agentKeys.permissions(agentId),
    staleTime: Infinity,
    queryFn: async (): Promise<AgentPermission[]> => {
      const res = await serverFetch(`/agents/${agentId}/permissions`);
      if (!res.ok) throw new Error('Failed to fetch agent permissions');
      return res.json() as Promise<AgentPermission[]>;
    },
  });
}

export function useUpsertAgentPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      agentId: string;
      toolName: string;
      pattern: string | null;
      permission: AgentPermissionValue;
    }) => {
      const res = await serverFetch(`/agents/${input.agentId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: input.toolName,
          pattern: input.pattern,
          permission: input.permission,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update permission');
      }
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.permissions(input.agentId) });
    },
  });
}

export function useDeleteAgentPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { agentId: string; permissionId: string }) => {
      const res = await serverFetch(`/agents/${input.agentId}/permissions/${input.permissionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete permission');
      }
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.permissions(input.agentId) });
    },
  });
}
