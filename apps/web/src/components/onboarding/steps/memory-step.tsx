import * as React from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { EmbeddingProviderModels } from '@stitch/shared/embedding/types';

import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { embeddingProviderModelsQueryOptions } from '@/lib/queries/providers';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';

type ModelOption = { value: string; label: string; providerId: string; modelId: string };

function buildModelOptions(providerModels: EmbeddingProviderModels[] | undefined): ModelOption[] {
  if (!providerModels) return [];
  const options: ModelOption[] = [];
  for (const provider of providerModels) {
    for (const model of provider.models) {
      options.push({
        value: `${provider.providerId}:${model.id}`,
        label: `${provider.providerName} - ${model.name}`,
        providerId: provider.providerId,
        modelId: model.id,
      });
    }
  }
  return options;
}

type Props = { onComplete: () => void; onBackToProviders: () => void };

export function MemoryStep({ onComplete, onBackToProviders }: Props) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(settingsQueryOptions);
  const { data: providerModels } = useQuery(embeddingProviderModelsQueryOptions);

  const saveEnabled = useMutation(saveSettingMutationOptions('memory.enabled', queryClient, { silent: true }));
  const saveProvider = useMutation(
    saveSettingMutationOptions('memory.embedding.providerId', queryClient, { silent: true }),
  );
  const saveModel = useMutation(saveSettingMutationOptions('memory.embedding.modelId', queryClient, { silent: true }));

  const modelOptions = buildModelOptions(providerModels);

  const [chosenValue, setChosenValue] = React.useState<string | null>(null);

  const existingValue = settings
    ? `${settings['memory.embedding.providerId']}:${settings['memory.embedding.modelId']}`
    : '';
  const defaultValue = modelOptions.some((option) => option.value === existingValue)
    ? existingValue
    : (modelOptions[0]?.value ?? '');
  const selectedValue = chosenValue ?? defaultValue;

  if (!settings || !providerModels) {
    return (
      <Text as="div" variant="body" tone="muted">
        Loading memory settings...
      </Text>
    );
  }

  const hasModels = modelOptions.length > 0;
  const selectedOption = modelOptions.find((option) => option.value === selectedValue);
  const isSaving = saveEnabled.isPending || saveProvider.isPending || saveModel.isPending;

  function handleDisableMemories() {
    void saveEnabled
      .mutateAsync('false')
      .then(onComplete)
      .catch(() => undefined);
  }

  function handleEnableMemories() {
    if (!selectedOption) return;
    void Promise.all([
      saveProvider.mutateAsync(selectedOption.providerId),
      saveModel.mutateAsync(selectedOption.modelId),
      saveEnabled.mutateAsync('true'),
    ])
      .then(onComplete)
      .catch(() => undefined);
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-center gap-space-2xl">
      <div className="space-y-space-m text-center">
        <Text variant="heading-l">Enable memories?</Text>
        <Text variant="body" tone="muted">
          Memories help Stitch remember preferences and recurring context across sessions.
        </Text>
      </div>

      {hasModels ? (
        <div className="space-y-space-m">
          <Label htmlFor="onboarding-memory-model">Embedding model</Label>
          <Select value={selectedValue} onValueChange={(value) => setChosenValue(value ?? '')}>
            <SelectTrigger id="onboarding-memory-model" className="w-full">
              <SelectValue placeholder="Select an embedding model">{selectedOption?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {modelOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="rounded-md border border-border-subtle bg-surface-sunken px-space-l py-space-m">
          <Text variant="body" tone="muted">
            No embedding models in providers configured. Please add another provider that has one
          </Text>
        </div>
      )}

      <Stack direction="row" align="center" justify="center" gap="m">
        {!hasModels && (
          <Button variant="outline" onClick={onBackToProviders} disabled={isSaving}>
            Add provider
          </Button>
        )}
        <Button variant="outline" onClick={handleDisableMemories} disabled={isSaving}>
          Not now
        </Button>
        <Button onClick={handleEnableMemories} disabled={isSaving || !hasModels || !selectedOption}>
          {isSaving ? 'Saving...' : 'Enable memories'}
        </Button>
      </Stack>
    </div>
  );
}
