import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  McpAuthConfig,
  McpRegistryServer,
  McpServer,
  McpTool,
  McpTransport,
} from '@stitch/shared/mcp/types';

import { serverFetch } from '@/lib/api';
import { toolKeys } from '@/lib/queries/tools';

const mcpKeys = {
  all: ['mcp'] as const,
  list: () => [...mcpKeys.all, 'list'] as const,
  registry: () => [...mcpKeys.all, 'registry'] as const,
  tools: (id: string) => [...mcpKeys.all, 'tools', id] as const,
};

export const mcpServersQueryOptions = queryOptions({
  queryKey: mcpKeys.list(),
  staleTime: Infinity,
  queryFn: async (): Promise<McpServer[]> => {
    const res = await serverFetch('/mcp');
    if (!res.ok) throw new Error('Failed to fetch MCP servers');
    return res.json() as Promise<McpServer[]>;
  },
});

export const mcpToolsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: mcpKeys.tools(id),
    staleTime: 0,
    retry: false,
    queryFn: async (): Promise<McpTool[]> => {
      const res = await serverFetch(`/mcp/${id}/tools`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Failed to fetch MCP tools');
      }
      return res.json() as Promise<McpTool[]>;
    },
  });

export const mcpRegistryQueryOptions = queryOptions({
  queryKey: mcpKeys.registry(),
  staleTime: 5 * 60 * 1000,
  queryFn: async (): Promise<McpRegistryServer[]> => {
    const res = await serverFetch('/mcp/registry');
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? 'Failed to fetch MCP registry');
    }
    return res.json() as Promise<McpRegistryServer[]>;
  },
});

export function useAddMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      transport: McpTransport;
      url: string;
      authConfig: McpAuthConfig;
    }): Promise<{ id: string }> => {
      const res = await serverFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to add MCP server');
      }
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpKeys.all });
      void queryClient.invalidateQueries({ queryKey: toolKeys.all });
    },
  });
}

export function useDeleteMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await serverFetch(`/mcp/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete MCP server');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpKeys.all });
      void queryClient.invalidateQueries({ queryKey: toolKeys.all });
    },
  });
}

export function useRefreshMcpServers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await serverFetch('/mcp/refresh', { method: 'POST' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to refresh MCP servers');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpKeys.all });
      void queryClient.invalidateQueries({ queryKey: toolKeys.all });
    },
  });
}

export function useRefreshMcpRegistry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await serverFetch('/mcp/registry/refresh', { method: 'POST' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to refresh MCP registry');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpKeys.registry() });
    },
  });
}
