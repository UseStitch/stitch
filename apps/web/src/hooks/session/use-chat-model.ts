import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { ModelSpec } from '@/components/chat/chat-input';
import { settingsQueryOptions } from '@/lib/queries/settings';

type UseChatModelResult = {
  selectedModel: ModelSpec | null;
  handleModelChange: (model: ModelSpec | null) => void;
};

type UseChatModelInput = {
  lastUsedModel?: ModelSpec | null;
};

export function useChatModel(input?: UseChatModelInput): UseChatModelResult {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const [modelOverride, setModelOverride] = React.useState<ModelSpec | null>(null);

  const providerId = settings['model.default.providerId']?.trim();
  const modelId = settings['model.default.modelId']?.trim();
  const savedModel = providerId && modelId ? { providerId, modelId } : null;
  const selectedModel = modelOverride ?? input?.lastUsedModel ?? savedModel;

  const handleModelChange = (model: ModelSpec | null) => {
    setModelOverride(model);
  };

  return { selectedModel, handleModelChange };
}
