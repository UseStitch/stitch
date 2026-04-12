import * as React from 'react';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { resetMemoriesMutationOptions } from '@/lib/queries/memories';
import { embeddingProviderModelsQueryOptions, type ProviderModels } from '@/lib/queries/providers';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';

type ModelOption = {
  label: string;
  providerId: string;
  modelId: string;
};

type ModelGroup = {
  value: string;
  items: ModelOption[];
};

function buildGroupedItems(providerModels: ProviderModels[]): ModelGroup[] {
  return providerModels.map((provider) => ({
    value: provider.providerName,
    items: provider.models.map((model) => ({
      label: model.name,
      providerId: provider.providerId,
      modelId: model.id,
    })),
  }));
}

function flattenGroups(groups: ModelGroup[]): ModelOption[] {
  return groups.flatMap((g) => g.items);
}

function EmbeddingModelSelect({
  currentProviderId,
  currentModelId,
  providerModels,
}: {
  currentProviderId: string | undefined;
  currentModelId: string | undefined;
  providerModels: ProviderModels[];
}) {
  const queryClient = useQueryClient();
  const [pendingValue, setPendingValue] = React.useState<ModelOption | null | undefined>(undefined);

  const groups = React.useMemo(() => buildGroupedItems(providerModels), [providerModels]);
  const allOptions = React.useMemo(() => flattenGroups(groups), [groups]);

  const saveProviderMutation = useMutation(
    saveSettingMutationOptions('memory.embedding.providerId', queryClient, { silent: true }),
  );
  const saveModelMutation = useMutation(
    saveSettingMutationOptions('memory.embedding.modelId', queryClient, { silent: true }),
  );
  const resetMutation = useMutation(resetMemoriesMutationOptions(queryClient));

  function isActualChange(value: ModelOption | null): boolean {
    if (!value) return false;
    return value.providerId !== currentProviderId || value.modelId !== currentModelId;
  }

  function handleValueChange(value: ModelOption | null) {
    if (!isActualChange(value)) return;
    if (!value) return;

    if (!currentProviderId && !currentModelId) {
      saveProviderMutation.mutate(value.providerId);
      saveModelMutation.mutate(value.modelId);
      return;
    }

    setPendingValue(value);
  }

  async function handleConfirm() {
    const value = pendingValue;
    setPendingValue(undefined);

    if (!value) return;

    await resetMutation.mutateAsync();

    saveProviderMutation.mutate(value.providerId);
    saveModelMutation.mutate(value.modelId);
  }

  function handleCancel() {
    setPendingValue(undefined);
  }

  const selectedOption =
    currentProviderId && currentModelId
      ? (allOptions.find(
          (o) => o.providerId === currentProviderId && o.modelId === currentModelId,
        ) ?? null)
      : null;

  const isConfirming = resetMutation.isPending;

  return (
    <>
      <Combobox<ModelOption>
        value={selectedOption}
        onValueChange={handleValueChange}
        isItemEqualToValue={(a, b) => a.providerId === b.providerId && a.modelId === b.modelId}
        items={groups}
      >
        <ComboboxInput placeholder="Select embedding model" showClear={false} />
        <ComboboxContent side="bottom" sideOffset={4} align="start">
          <ComboboxEmpty>No models found</ComboboxEmpty>
          <ComboboxList>
            {(group, index) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(item) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
                {index < groups.length - 1 && <ComboboxSeparator />}
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      <Dialog open={pendingValue !== undefined} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change embedding model?</DialogTitle>
            <DialogDescription>
              Switching the embedding model will permanently delete all stored memories. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel} disabled={isConfirming}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirm()}
              disabled={isConfirming}
            >
              {isConfirming ? 'Deleting...' : 'Delete memories & switch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MemoryToggles() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: providerModels } = useSuspenseQuery(embeddingProviderModelsQueryOptions);

  const memoryEnabled = settings['memory.enabled'] !== 'false';
  const autoExtract = settings['memory.autoExtract'] !== 'false';
  const hasEmbeddingSelection =
    settings['memory.embedding.providerId']?.trim().length > 0 &&
    settings['memory.embedding.modelId']?.trim().length > 0;
  const selectedModelAvailable = providerModels.some(
    (provider) =>
      provider.providerId === settings['memory.embedding.providerId'] &&
      provider.models.some((model) => model.id === settings['memory.embedding.modelId']),
  );
  const canEnableMemory = hasEmbeddingSelection && selectedModelAvailable;

  const saveEnabledMutation = useMutation(
    saveSettingMutationOptions('memory.enabled', queryClient, { silent: true }),
  );
  const saveAutoExtractMutation = useMutation(
    saveSettingMutationOptions('memory.autoExtract', queryClient, { silent: true }),
  );

  return (
    <>
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label htmlFor="memory-enabled-toggle" className="text-sm font-medium">
            Enable Memory
          </Label>
          <p className="text-xs text-muted-foreground">
            Learn and remember preferences, facts, and workflows across sessions
          </p>
        </div>
        <Switch
          id="memory-enabled-toggle"
          checked={memoryEnabled}
          disabled={!memoryEnabled && !canEnableMemory}
          onCheckedChange={(checked) => saveEnabledMutation.mutate(checked ? 'true' : 'false')}
        />
      </div>
      {!memoryEnabled && !canEnableMemory && (
        <p className="text-xs text-muted-foreground">Select an embedding model to enable memory.</p>
      )}
      <div className="flex items-center justify-between gap-4 border-t border-border/50 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label htmlFor="auto-extract-toggle" className="text-sm font-medium">
            Auto-extract memories
          </Label>
          <p className="text-xs text-muted-foreground">
            Automatically extract facts from conversations after each response
          </p>
        </div>
        <Switch
          id="auto-extract-toggle"
          checked={autoExtract}
          disabled={!memoryEnabled}
          onCheckedChange={(checked) => saveAutoExtractMutation.mutate(checked ? 'true' : 'false')}
        />
      </div>
    </>
  );
}

function EmbeddingModelContent() {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: providerModels } = useSuspenseQuery(embeddingProviderModelsQueryOptions);

  if (providerModels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No embedding models in providers configured. Please add another provider that has one
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label className="text-sm font-medium">Embedding Model</Label>
        <p className="text-xs text-muted-foreground">
          Model used for memory search. Required to enable memory.
        </p>
      </div>
      <div className="w-52 shrink-0">
        <EmbeddingModelSelect
          currentProviderId={settings['memory.embedding.providerId']}
          currentModelId={settings['memory.embedding.modelId']}
          providerModels={providerModels}
        />
      </div>
    </div>
  );
}

export function MemorySettings() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <h2 className="text-base font-bold">Memory</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure how Stitch remembers information across sessions
        </p>
      </div>
      <section className="space-y-3">
        <h3 className="text-sm font-medium">General</h3>
        <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
          <MemoryToggles />
        </React.Suspense>
      </section>
      <section className="mt-8 space-y-3">
        <h3 className="text-sm font-medium">Embedding</h3>
        <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
          <EmbeddingModelContent />
        </React.Suspense>
      </section>
    </div>
  );
}
