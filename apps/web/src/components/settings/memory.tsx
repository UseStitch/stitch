import * as React from 'react';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import type { EmbeddingProviderModels } from '@stitch/shared/embedding/types';

import { ModelCombobox, type ModelSelection } from '@/components/model-selectors/model-combobox';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import {
  NumberSettingRow,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resetMemoriesMutationOptions } from '@/lib/queries/memories';
import { embeddingProviderModelsQueryOptions } from '@/lib/queries/providers';
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
  providerModels: EmbeddingProviderModels[];
}) {
  const queryClient = useQueryClient();
  const [pendingValue, setPendingValue] = React.useState<ModelSelection | null | undefined>(
    undefined,
  );

  const saveProviderMutation = useMutation(
    saveSettingMutationOptions('memory.embedding.providerId', queryClient, { silent: true }),
  );
  const saveModelMutation = useMutation(
    saveSettingMutationOptions('memory.embedding.modelId', queryClient, { silent: true }),
  );
  const resetMutation = useMutation(resetMemoriesMutationOptions(queryClient));

  const value: ModelSelection | null =
    currentProviderId && currentModelId
      ? { providerId: currentProviderId, modelId: currentModelId }
      : null;

  function handleValueChange(selection: ModelSelection | null) {
    if (!selection) return;
    const isActualChange =
      selection.providerId !== currentProviderId || selection.modelId !== currentModelId;
    if (!isActualChange) return;

    if (!currentProviderId && !currentModelId) {
      saveProviderMutation.mutate(selection.providerId);
      saveModelMutation.mutate(selection.modelId);
      return;
    }

    setPendingValue(selection);
  }

  async function handleConfirm() {
    const selection = pendingValue;
    setPendingValue(undefined);
    if (!selection) return;

    await resetMutation.mutateAsync();
    saveProviderMutation.mutate(selection.providerId);
    saveModelMutation.mutate(selection.modelId);
  }

  function handleCancel() {
    setPendingValue(undefined);
  }

  const isConfirming = resetMutation.isPending;

  return (
    <>
      <ModelCombobox
        providerModels={providerModels}
        value={value}
        onValueChange={handleValueChange}
        placeholder="Select embedding model"
        showClear={false}
      />

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
  const page = SETTINGS_PAGE_BY_ID.memory;
  const Icon = page.icon;

  return (
    <SettingPage
      title={page.title}
      description={page.description}
      icon={<Icon className="size-5" />}
    >
      <Tabs defaultValue="general" className="space-y-5">
        <TabsList variant="line">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="embedding">Embedding</TabsTrigger>
          <TabsTrigger value="extraction">Extraction</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
          <TabsTrigger value="retrieval">Retrieval</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <SettingSection className="mt-0">
            <MemoryToggles />
          </SettingSection>
        </TabsContent>
        <TabsContent value="embedding">
          <SettingSection className="mt-0">
            <EmbeddingModelContent />
          </SettingSection>
        </TabsContent>
        <TabsContent value="extraction">
          <SettingSection className="mt-0">
            <ExtractionSettings />
          </SettingSection>
        </TabsContent>
        <TabsContent value="retention">
          <SettingSection className="mt-0">
            <RetentionSettings />
          </SettingSection>
        </TabsContent>
        <TabsContent value="retrieval">
          <SettingSection className="mt-0">
            <RetrievalSettings />
          </SettingSection>
        </TabsContent>
      </Tabs>
    </SettingPage>
  );
}
