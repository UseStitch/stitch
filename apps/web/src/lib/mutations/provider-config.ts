import { useMutation, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { serverFetch } from '@/lib/api';
import { providerKeys } from '@/lib/queries/providers';

type ProviderConfigBody = Record<string, unknown>;

type SaveProviderConfigMutationOptions = {
  providerId: string;
  queryClient: QueryClient;
  successMessage: string;
  errorMessage: string;
  onSuccess?: () => Promise<void> | void;
};

type DeleteProviderConfigMutationOptions = {
  providerId: string;
  queryClient: QueryClient;
  successMessage: string;
  errorMessage: string;
  onSuccess?: () => Promise<void> | void;
};

async function invalidateProviderQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: providerKeys.list() }),
    queryClient.invalidateQueries({ queryKey: providerKeys.enabledModels() }),
  ]);
}

export function useSaveProviderConfigMutation({
  providerId,
  queryClient,
  successMessage,
  errorMessage,
  onSuccess,
}: SaveProviderConfigMutationOptions) {
  return useMutation({
    mutationFn: async (body: ProviderConfigBody) => {
      const res = await serverFetch(`/provider/${providerId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? errorMessage);
      }

      return body;
    },
    onSuccess: async (savedConfig) => {
      queryClient.setQueryData(providerKeys.config(providerId), savedConfig);
      await invalidateProviderQueries(queryClient);
      toast.success(successMessage);
      await onSuccess?.();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : errorMessage;
      toast.error(message);
    },
  });
}

export function useDeleteProviderConfigMutation({
  providerId,
  queryClient,
  successMessage,
  errorMessage,
  onSuccess,
}: DeleteProviderConfigMutationOptions) {
  return useMutation({
    mutationFn: async () => {
      const res = await serverFetch(`/provider/${providerId}/config`, { method: 'DELETE' });
      if (!res.ok) throw new Error(errorMessage);
    },
    onSuccess: async () => {
      queryClient.setQueryData(providerKeys.config(providerId), null);
      await invalidateProviderQueries(queryClient);
      toast.success(successMessage);
      await onSuccess?.();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : errorMessage;
      toast.error(message);
    },
  });
}
