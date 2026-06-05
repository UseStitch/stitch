import { BrainIcon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import {
  buildGroupedItems,
  flattenGroups,
  type ModelOption,
} from '@/components/settings/model-select';
import {
  NumberSettingRow,
  SettingLoading,
  SettingPage,
  SettingRow,
  SettingRowControl,
  SettingRows,
  SettingSection,
  SliderSettingRow,
  SwitchSettingRow,
} from '@/components/settings/settings-ui';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { resetMemoriesMutationOptions } from '@/lib/queries/memories';
import { embeddingProviderModelsQueryOptions, type ProviderModels } from '@/lib/queries/providers';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';

const CONFIDENCE_FILTER_OPTIONS = [
  { value: 'stated', label: 'Stated only (Strict)' },
  { value: 'stated+confirmed', label: 'Stated + Confirmed' },
  { value: 'all', label: 'All (Includes Inferred)' },
] as const;

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
      <SettingRows>
        <SettingRow
          label="Enable Memory"
          description="Learn and remember preferences, facts, and workflows across sessions"
          htmlFor="memory-enabled-toggle"
        >
          <Switch
            id="memory-enabled-toggle"
            checked={memoryEnabled}
            disabled={!memoryEnabled && !canEnableMemory}
            onCheckedChange={(checked) => saveEnabledMutation.mutate(checked ? 'true' : 'false')}
          />
        </SettingRow>
        <SettingRow
          label="Auto-extract memories"
          description="Automatically extract facts from conversations after each response"
          htmlFor="auto-extract-toggle"
        >
          <Switch
            id="auto-extract-toggle"
            checked={autoExtract}
            disabled={!memoryEnabled}
            onCheckedChange={(checked) =>
              saveAutoExtractMutation.mutate(checked ? 'true' : 'false')
            }
          />
        </SettingRow>
      </SettingRows>
      {!memoryEnabled && !canEnableMemory ? (
        <p className="text-xs text-muted-foreground">Select an embedding model to enable memory.</p>
      ) : null}
    </>
  );
}

function ExtractionSettings() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const confidenceFilter = settings['memory.extraction.confidenceFilter'];
  const selectedConfidenceLabel =
    CONFIDENCE_FILTER_OPTIONS.find((option) => option.value === confidenceFilter)?.label ??
    'Select confidence filter';

  const saveConfidenceFilter = useMutation(
    saveSettingMutationOptions('memory.extraction.confidenceFilter', queryClient, { silent: true }),
  );

  const importanceScore = Math.max(
    0,
    Math.min(1, Number.parseFloat(settings['memory.extraction.importanceMinScore'] ?? '0.7')),
  );

  return (
    <SettingRows>
      <NumberSettingRow
        settingKey="memory.extraction.maxFactsPerTurn"
        label="Max Facts Per Turn"
        description="Maximum number of memories extracted in a single response."
        currentValue={settings['memory.extraction.maxFactsPerTurn']}
        min={1}
        max={10}
      />
      <NumberSettingRow
        settingKey="memory.extraction.minMessageLength"
        label="Min Message Length"
        description="Skip extraction if user message is shorter than this (characters)."
        currentValue={settings['memory.extraction.minMessageLength']}
        min={0}
        max={500}
      />
      <SettingRow label="Confidence Filter" description="Which types of extracted facts to store.">
        <SettingRowControl>
          <Select
            value={confidenceFilter}
            onValueChange={(val) => {
              if (val) saveConfidenceFilter.mutate(val);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{selectedConfidenceLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CONFIDENCE_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRowControl>
      </SettingRow>
      <SliderSettingRow
        settingKey="memory.extraction.importanceMinScore"
        label="Min Importance Score"
        description="Facts below this threshold (0-1) are discarded. Higher = stricter capture."
        currentValue={importanceScore}
        min={0}
        max={1}
        step={0.05}
      />
      <NumberSettingRow
        settingKey="memory.extraction.maxFactsPerSession"
        label="Max Facts Per Session"
        description="Hard cap on total auto-extracted memories written per session."
        currentValue={settings['memory.extraction.maxFactsPerSession']}
        min={1}
        max={200}
      />
      <NumberSettingRow
        settingKey="memory.extraction.minTurnsBetweenWrites"
        label="Min Turns Between Writes"
        description="Cooldown: minimum user turns between consecutive auto-memory writes."
        currentValue={settings['memory.extraction.minTurnsBetweenWrites']}
        min={0}
        max={20}
      />
    </SettingRows>
  );
}

function RetentionSettings() {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);

  return (
    <SettingRows>
      <NumberSettingRow
        settingKey="memory.retention.maxMemories"
        label="Max Memories"
        description="Hard cap on total stored memories. Oldest low-value memories are pruned first."
        currentValue={settings['memory.retention.maxMemories']}
        min={10}
        max={5000}
      />
      <NumberSettingRow
        settingKey="memory.retention.staleDays"
        label="Stale Days"
        description="Memories not accessed in this many days are candidates for pruning."
        currentValue={settings['memory.retention.staleDays']}
        min={1}
        max={365}
      />
      <SwitchSettingRow
        settingKey="memory.retention.autoprune"
        label="Auto-prune"
        description="Run automatic pruning after extraction to stay within limits."
        checked={settings['memory.retention.autoprune'] === 'true'}
      />
    </SettingRows>
  );
}

function RetrievalSettings() {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);

  const minScore = Math.max(
    0,
    Math.min(1, Number.parseFloat(settings['memory.retrieval.minScore'] ?? '0')),
  );

  return (
    <SettingRows>
      <NumberSettingRow
        settingKey="memory.retrieval.maxResults"
        label="Max Context Results"
        description="Maximum memories injected into context per turn."
        currentValue={settings['memory.retrieval.maxResults']}
        min={1}
        max={20}
      />
      <SliderSettingRow
        settingKey="memory.retrieval.minScore"
        label="Min Relevance Score"
        description="Minimum score (0.0 to 1.0) to include a memory."
        currentValue={minScore}
        min={0}
        max={1}
        step={0.05}
      />
      <SwitchSettingRow
        settingKey="memory.retrieval.recencyBoost"
        label="Recency Boost"
        description="Boost recently-accessed memories in ranking."
        checked={settings['memory.retrieval.recencyBoost'] === 'true'}
      />
    </SettingRows>
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
    <SettingRows>
      <SettingRow
        label="Embedding Model"
        description="Model used for memory search. Required to enable memory."
      >
        <SettingRowControl>
          <EmbeddingModelSelect
            currentProviderId={settings['memory.embedding.providerId']}
            currentModelId={settings['memory.embedding.modelId']}
            providerModels={providerModels}
          />
        </SettingRowControl>
      </SettingRow>
    </SettingRows>
  );
}

export function MemorySettings() {
  return (
    <SettingPage
      title="Memory"
      description="Configure how Stitch remembers information across sessions"
      icon={<BrainIcon className="size-5" />}
    >
      <SettingSection title="General">
        <React.Suspense fallback={<SettingLoading />}>
          <MemoryToggles />
        </React.Suspense>
      </SettingSection>
      <SettingSection title="Embedding">
        <React.Suspense fallback={<SettingLoading />}>
          <EmbeddingModelContent />
        </React.Suspense>
      </SettingSection>
      <SettingSection title="Extraction">
        <React.Suspense fallback={<SettingLoading />}>
          <ExtractionSettings />
        </React.Suspense>
      </SettingSection>
      <SettingSection title="Retention">
        <React.Suspense fallback={<SettingLoading />}>
          <RetentionSettings />
        </React.Suspense>
      </SettingSection>
      <SettingSection title="Retrieval">
        <React.Suspense fallback={<SettingLoading />}>
          <RetrievalSettings />
        </React.Suspense>
      </SettingSection>
    </SettingPage>
  );
}
