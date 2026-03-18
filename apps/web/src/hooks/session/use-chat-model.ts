import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import { settingsQueryOptions } from '@/lib/queries/settings';

type UseChatModelResult = {
  selectedModel: string | null;
  handleModelChange: (model: string | null) => void;
};

type UseChatModelInput = {
  lastUsedModel?: string | null;
};

export function useChatModel(input?: UseChatModelInput): UseChatModelResult {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const [modelOverride, setModelOverride] = React.useState<string | null>(null);

  const selectedModel = modelOverride ?? input?.lastUsedModel ?? settings['model.default'] ?? null;

  const handleModelChange = (model: string | null) => {
    setModelOverride(model);
  };

  return { selectedModel, handleModelChange };
}
