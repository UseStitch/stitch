import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { ConnectorDefinition, ConnectorInstanceSafe, ConnectorSafe } from '@stitch/shared/connectors/types';

import { serverRequest } from '@/lib/api';

const connectorKeys = {
  all: ['connectors'] as const,
  configured: () => [...connectorKeys.all, 'configured'] as const,
  definitions: () => [...connectorKeys.all, 'definitions'] as const,
  instances: () => [...connectorKeys.all, 'instances'] as const,
  instance: (id: string) => [...connectorKeys.all, 'instance', id] as const,
};

export const connectorDefinitionsQueryOptions = queryOptions({
  queryKey: connectorKeys.definitions(),
  queryFn: () => serverRequest<ConnectorDefinition[]>('/connectors/definitions'),
});

export const connectorsQueryOptions = queryOptions({
  queryKey: connectorKeys.configured(),
  queryFn: () => serverRequest<ConnectorSafe[]>('/connectors'),
});

export const connectorInstancesQueryOptions = queryOptions({
  queryKey: connectorKeys.instances(),
  staleTime: 30_000,
  refetchInterval: (query) => {
    const data = query.state.data;
    return data?.some((instance) => instance.status === 'awaiting_auth') ? 2000 : false;
  },
  queryFn: () => serverRequest<ConnectorInstanceSafe[]>('/connectors/instances'),
});

export function useCreateOAuthConnectorCredentials() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { connectorId: string; label: string; clientId: string; clientSecret: string }) =>
      serverRequest<ConnectorSafe>('/connectors/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export function useCreateOAuthConnectorAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { connectorRefId: string; label: string; scopes: string[] }) =>
      serverRequest<ConnectorInstanceSafe>('/connectors/instances/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export function useCreateApiKeyConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { connectorId: string; label: string; apiKey: string }) =>
      serverRequest<ConnectorInstanceSafe>('/connectors/instances/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export function useAuthorizeConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) =>
      serverRequest<{ authUrl: string }>(`/connectors/instances/${instanceId}/authorize`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export function useDeleteConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) =>
      serverRequest<void>(`/connectors/instances/${instanceId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export function useTestConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) =>
      serverRequest<{ success: boolean }>(`/connectors/instances/${instanceId}/test`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export function useUpgradeConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { instanceId: string; apiKey?: string }) =>
      serverRequest<{ type: 'reauthorize'; authUrl: string } | { type: 'updated' }>(
        `/connectors/instances/${input.instanceId}/upgrade`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: input.apiKey }),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}
