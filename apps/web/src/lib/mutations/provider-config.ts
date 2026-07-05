import { toast } from 'sonner';

import { useMutation, type QueryClient } from '@tanstack/react-query';

import { serverRequest } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
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
    queryClient.invalidateQueries({ queryKey: providerKeys.visibleModels() }),
    queryClient.invalidateQueries({ queryKey: providerKeys.embeddingModels() }),
    queryClient.invalidateQueries({ queryKey: providerKeys.sttModels() }),
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
      await serverRequest<void>(`/llm/provider/${providerId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return body;
    },
    onSuccess: async (savedConfig) => {
      queryClient.setQueryData(providerKeys.config(providerId), savedConfig);
      await invalidateProviderQueries(queryClient);
      toast.success(successMessage, { id: `provider-config-save-${providerId}` });
      await onSuccess?.();
    },
    onError: (error) => {
      const message = getErrorMessage(error, errorMessage);
      toast.error(message, { id: `provider-config-save-${providerId}` });
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
    mutationFn: () => serverRequest<void>(`/llm/provider/${providerId}/config`, { method: 'DELETE' }),
    onSuccess: async () => {
      queryClient.setQueryData(providerKeys.config(providerId), null);
      await invalidateProviderQueries(queryClient);
      toast.success(successMessage, { id: `provider-config-delete-${providerId}` });
      await onSuccess?.();
    },
    onError: (error) => {
      const message = getErrorMessage(error, errorMessage);
      toast.error(message, { id: `provider-config-delete-${providerId}` });
    },
  });
}
