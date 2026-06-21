import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  McpAuthConfig,
  McpRegistryServer,
  McpServer,
  McpTool,
  McpTransport,
} from '@stitch/shared/mcp/types';

import { serverRequest } from '@/lib/api';
import { toolKeys } from '@/lib/queries/tools';

export const mcpKeys = {
  all: ['mcp'] as const,
  list: () => [...mcpKeys.all, 'list'] as const,
  registry: () => [...mcpKeys.all, 'registry'] as const,
  tools: (id: string) => [...mcpKeys.all, 'tools', id] as const,
};

export const mcpServersQueryOptions = queryOptions({
  queryKey: mcpKeys.list(),
  queryFn: () => serverRequest<McpServer[]>('/mcp'),
});

export const mcpToolsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: mcpKeys.tools(id),
    staleTime: 0,
    retry: false,
    queryFn: () => serverRequest<McpTool[]>(`/mcp/${id}/tools`),
  });

export const mcpRegistryQueryOptions = queryOptions({
  queryKey: mcpKeys.registry(),
  staleTime: 5 * 60 * 1000,
  queryFn: () => serverRequest<McpRegistryServer[]>('/mcp/registry'),
});

export function useAddMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      transport: McpTransport;
      url: string;
      authConfig: McpAuthConfig;
    }) =>
      serverRequest<{ id: string }>('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpKeys.all });
      void queryClient.invalidateQueries({ queryKey: toolKeys.all });
    },
  });
}

export function useDeleteMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => serverRequest<void>(`/mcp/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpKeys.all });
      void queryClient.invalidateQueries({ queryKey: toolKeys.all });
    },
  });
}

export function useRefreshMcpServers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => serverRequest<void>('/mcp/refresh', { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpKeys.all });
      void queryClient.invalidateQueries({ queryKey: toolKeys.all });
    },
  });
}

export function useRefreshMcpRegistry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => serverRequest<void>('/mcp/registry/refresh', { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpKeys.registry() });
    },
  });
}

function openAuthUrl(authUrl: string): void {
  if (!authUrl) return;
  void (window.api?.shell?.openExternal(authUrl) ?? window.open(authUrl, '_blank'));
}

export function useStartMcpAuth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      serverRequest<{ authUrl: string }>(`/mcp/${id}/auth`, { method: 'POST' }),
    onSuccess: (data) => {
      openAuthUrl(data.authUrl);
      void queryClient.invalidateQueries({ queryKey: mcpKeys.all });
    },
  });
}

export function useMcpLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => serverRequest<void>(`/mcp/${id}/auth/logout`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpKeys.all });
      void queryClient.invalidateQueries({ queryKey: toolKeys.all });
    },
  });
}
