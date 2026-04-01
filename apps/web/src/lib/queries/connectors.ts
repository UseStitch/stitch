import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  ConnectorDefinition,
  ConnectorInstanceSafe,
  ConnectorOAuthProfile,
} from '@stitch/shared/connectors/types';

import { serverFetch } from '@/lib/api';

const connectorKeys = {
  all: ['connectors'] as const,
  definitions: () => [...connectorKeys.all, 'definitions'] as const,
  instances: () => [...connectorKeys.all, 'instances'] as const,
  oauthProfiles: (connectorId: string) =>
    [...connectorKeys.all, 'oauth-profiles', connectorId] as const,
  instance: (id: string) => [...connectorKeys.all, 'instance', id] as const,
};

export const connectorDefinitionsQueryOptions = queryOptions({
  queryKey: connectorKeys.definitions(),
  staleTime: Infinity,
  queryFn: async (): Promise<ConnectorDefinition[]> => {
    const res = await serverFetch('/connectors/definitions');
    if (!res.ok) throw new Error('Failed to fetch connector definitions');
    return res.json() as Promise<ConnectorDefinition[]>;
  },
});

export const connectorInstancesQueryOptions = queryOptions({
  queryKey: connectorKeys.instances(),
  staleTime: 30_000,
  refetchInterval: (query) => {
    const data = query.state.data;
    return data?.some((instance) => instance.status === 'awaiting_auth') ? 2000 : false;
  },
  queryFn: async (): Promise<ConnectorInstanceSafe[]> => {
    const res = await serverFetch('/connectors/instances');
    if (!res.ok) throw new Error('Failed to fetch connector instances');
    return res.json() as Promise<ConnectorInstanceSafe[]>;
  },
});

export function connectorOAuthProfilesQueryOptions(connectorId: string) {
  return queryOptions({
    queryKey: connectorKeys.oauthProfiles(connectorId),
    staleTime: 30_000,
    queryFn: async (): Promise<ConnectorOAuthProfile[]> => {
      const res = await serverFetch(`/connectors/oauth-profiles/${connectorId}`);
      if (!res.ok) throw new Error('Failed to fetch OAuth profiles');
      return res.json() as Promise<ConnectorOAuthProfile[]>;
    },
  });
}

export function useCreateOAuthConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      connectorId: string;
      label: string;
      oauthProfileId?: string;
      clientId?: string;
      clientSecret?: string;
      scopes: string[];
    }): Promise<ConnectorInstanceSafe> => {
      const res = await serverFetch('/connectors/instances/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to create connector');
      }
      return res.json() as Promise<ConnectorInstanceSafe>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export function useCreateOAuthProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      connectorId: string;
      label: string;
      clientId: string;
      clientSecret: string;
    }): Promise<ConnectorOAuthProfile> => {
      const res = await serverFetch('/connectors/oauth-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to create OAuth profile');
      }
      return res.json() as Promise<ConnectorOAuthProfile>;
    },
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({
        queryKey: connectorKeys.oauthProfiles(vars.connectorId),
      });
      void queryClient.invalidateQueries({ queryKey: connectorKeys.instances() });
    },
  });
}

export function useDeleteOAuthProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { profileId: string; connectorId: string }) => {
      const res = await serverFetch(`/connectors/oauth-profiles/${input.profileId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete OAuth profile');
      }
    },
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({
        queryKey: connectorKeys.oauthProfiles(vars.connectorId),
      });
      void queryClient.invalidateQueries({ queryKey: connectorKeys.instances() });
    },
  });
}

export function useCreateApiKeyConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      connectorId: string;
      label: string;
      apiKey: string;
    }): Promise<ConnectorInstanceSafe> => {
      const res = await serverFetch('/connectors/instances/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to create connector');
      }
      return res.json() as Promise<ConnectorInstanceSafe>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export function useAuthorizeConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (instanceId: string): Promise<{ authUrl: string }> => {
      const res = await serverFetch(`/connectors/instances/${instanceId}/authorize`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to start authorization');
      }
      return res.json() as Promise<{ authUrl: string }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export function useDeleteConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (instanceId: string) => {
      const res = await serverFetch(`/connectors/instances/${instanceId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete connector');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export function useTestConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (instanceId: string): Promise<{ success: boolean }> => {
      const res = await serverFetch(`/connectors/instances/${instanceId}/test`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Connection test failed');
      }
      return res.json() as Promise<{ success: boolean }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export function useUpgradeConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      instanceId: string;
      apiKey?: string;
    }): Promise<{ type: 'reauthorize'; authUrl: string } | { type: 'updated' }> => {
      const res = await serverFetch(`/connectors/instances/${input.instanceId}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: input.apiKey }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Upgrade failed');
      }
      return res.json() as Promise<{ type: 'reauthorize'; authUrl: string } | { type: 'updated' }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}
