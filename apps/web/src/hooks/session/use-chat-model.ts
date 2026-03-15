import * as React from 'react';
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsQueryOptions, saveSettingMutationOptions } from '@/lib/queries/settings';

type UseChatModelResult = {
  selectedModel: string | null;
  handleModelChange: (model: string | null) => void;
};

export function useChatModel(): UseChatModelResult {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const [modelOverride, setModelOverride] = React.useState<string | null>(null);

  const selectedModel = modelOverride ?? settings['model.default'] ?? null;

  const saveDefaultModel = useMutation(
    saveSettingMutationOptions('model.default', queryClient, { silent: true }),
  );

  const handleModelChange = (model: string | null) => {
    setModelOverride(model);
    if (model) saveDefaultModel.mutate(model);
  };

  return { selectedModel, handleModelChange };
}
