import * as React from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { embeddingProviderModelsQueryOptions, type ProviderModels } from '@/lib/queries/providers';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';

type ModelOption = {
  value: string;
  label: string;
  providerId: string;
  modelId: string;
};

function buildModelOptions(providerModels: ProviderModels[] | undefined): ModelOption[] {
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

type Props = {
  onComplete: () => void;
  onBackToProviders: () => void;
};

export function MemoryStep({ onComplete, onBackToProviders }: Props) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(settingsQueryOptions);
  const { data: providerModels } = useQuery(embeddingProviderModelsQueryOptions);

  const saveEnabled = useMutation(
    saveSettingMutationOptions('memory.enabled', queryClient, { silent: true }),
  );
  const saveProvider = useMutation(
    saveSettingMutationOptions('memory.embedding.providerId', queryClient, { silent: true }),
  );
  const saveModel = useMutation(
    saveSettingMutationOptions('memory.embedding.modelId', queryClient, { silent: true }),
  );

  const modelOptions = React.useMemo(() => buildModelOptions(providerModels), [providerModels]);

  const [selectedValue, setSelectedValue] = React.useState<string>('');

  React.useEffect(() => {
    if (!settings || modelOptions.length === 0) return;

    const existingValue = `${settings['memory.embedding.providerId']}:${settings['memory.embedding.modelId']}`;
    const hasExisting = modelOptions.some((option) => option.value === existingValue);
    setSelectedValue(hasExisting ? existingValue : modelOptions[0].value);
  }, [modelOptions, settings]);

  if (!settings || !providerModels) {
    return <div className="text-sm text-muted-foreground">Loading memory settings...</div>;
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
    <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-center gap-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Enable memories?</h2>
        <p className="text-sm text-muted-foreground">
          Memories help Stitch remember preferences and recurring context across sessions.
        </p>
      </div>

      {hasModels ? (
        <div className="space-y-2">
          <Label htmlFor="onboarding-memory-model">Embedding model</Label>
          <Select value={selectedValue} onValueChange={(value) => setSelectedValue(value ?? '')}>
            <SelectTrigger id="onboarding-memory-model" className="w-full">
              <SelectValue placeholder="Select an embedding model">
                {selectedOption?.label}
              </SelectValue>
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
        <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          No embedding models in providers configured. Please add another provider that has one
        </p>
      )}

      <div className="flex items-center justify-center gap-2">
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
      </div>
    </div>
  );
}
