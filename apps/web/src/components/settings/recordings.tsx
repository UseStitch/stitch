import * as React from 'react';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  audioProviderModelsQueryOptions,
  type ProviderModels,
} from '@/lib/queries/providers';
import {
  deleteSettingMutationOptions,
  saveSettingMutationOptions,
  settingsQueryOptions,
} from '@/lib/queries/settings';

type ModelOption = {
  label: string;
  providerId: string;
  modelId: string;
};

type ModelGroup = {
  value: string;
  items: ModelOption[];
};

const RECORDING_MODEL_PREFERENCES = [
  {
    providerIdKey: 'recordings.transcription.providerId',
    modelIdKey: 'recordings.transcription.modelId',
    label: 'Recording Transcription Model',
    description: 'Used to transcribe recordings with speaker attribution',
  },
  {
    providerIdKey: 'recordings.analysis.providerId',
    modelIdKey: 'recordings.analysis.modelId',
    label: 'Recording Analysis Model',
    description: 'Used for summaries, topics, and action item extraction',
  },
] as const;

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

function ModelSelect({
  providerIdKey,
  modelIdKey,
  currentProviderId,
  currentModelId,
  providerModels,
}: {
  providerIdKey: string;
  modelIdKey: string;
  currentProviderId: string | undefined;
  currentModelId: string | undefined;
  providerModels: ProviderModels[];
}) {
  const queryClient = useQueryClient();

  const groups = React.useMemo(() => buildGroupedItems(providerModels), [providerModels]);
  const allOptions = React.useMemo(() => flattenGroups(groups), [groups]);

  const saveProviderMutation = useMutation(saveSettingMutationOptions(providerIdKey, queryClient));
  const saveModelMutation = useMutation(
    saveSettingMutationOptions(modelIdKey, queryClient, { silent: true }),
  );
  const deleteProviderMutation = useMutation(
    deleteSettingMutationOptions(providerIdKey, queryClient),
  );
  const deleteModelMutation = useMutation(
    deleteSettingMutationOptions(modelIdKey, queryClient, { silent: true }),
  );

  function handleValueChange(value: ModelOption | null) {
    if (!value) {
      if (currentProviderId) deleteProviderMutation.mutate();
      if (currentModelId) deleteModelMutation.mutate();
      return;
    }

    saveProviderMutation.mutate(value.providerId);
    saveModelMutation.mutate(value.modelId);
  }

  const selectedOption =
    currentProviderId && currentModelId
      ? (allOptions.find(
          (o) => o.providerId === currentProviderId && o.modelId === currentModelId,
        ) ?? null)
      : null;

  return (
    <Combobox<ModelOption>
      value={selectedOption}
      onValueChange={handleValueChange}
      isItemEqualToValue={(a, b) => a.providerId === b.providerId && a.modelId === b.modelId}
      items={groups}
    >
      <ComboboxInput
        placeholder="Search models..."
        showClear={!!(currentProviderId && currentModelId)}
      />
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
  );
}

function RecordingsContent() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: audioProviderModels } = useSuspenseQuery(audioProviderModelsQueryOptions);
  const saveAutoAnalyzeMutation = useMutation(
    saveSettingMutationOptions('recordings.autoAnalyze', queryClient, { silent: true }),
  );

  const autoAnalyzeEnabled = settings['recordings.autoAnalyze'] === 'true';
  const hasTranscriptionModel =
    !!settings['recordings.transcription.providerId'] &&
    !!settings['recordings.transcription.modelId'];
  const hasAnalysisModel =
    !!settings['recordings.analysis.providerId'] && !!settings['recordings.analysis.modelId'];
  const canEnableAutoAnalyze = hasTranscriptionModel && hasAnalysisModel;
  const autoAnalyzeDisabled =
    saveAutoAnalyzeMutation.isPending || (!autoAnalyzeEnabled && !canEnableAutoAnalyze);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label className="text-sm font-medium">Auto analyze recordings</Label>
          <p className="text-xs text-muted-foreground">
            Automatically run transcription and analysis after a recording ends.
          </p>
        </div>
        <Switch
          checked={autoAnalyzeEnabled}
          onCheckedChange={(checked) => saveAutoAnalyzeMutation.mutate(checked ? 'true' : 'false')}
          disabled={autoAnalyzeDisabled}
        />
      </div>
      {!canEnableAutoAnalyze ? (
        <p className="text-xs text-muted-foreground">
          Select both a transcription model and an analysis model to enable auto analyze.
        </p>
      ) : null}

      {audioProviderModels.length === 0 ? (
        <p className="border-t border-border/50 py-3 text-sm text-muted-foreground">
          No audio-capable models are available for recording transcription.
        </p>
      ) : (
        RECORDING_MODEL_PREFERENCES.map((pref, index) => (
          <div
            key={pref.providerIdKey}
            className={`flex items-center justify-between gap-4 py-3 ${index < RECORDING_MODEL_PREFERENCES.length - 1 ? 'border-b border-border/50' : ''}`}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label className="text-sm font-medium">{pref.label}</Label>
              <p className="text-xs text-muted-foreground">{pref.description}</p>
            </div>
            <div className="w-52 shrink-0">
              <ModelSelect
                providerIdKey={pref.providerIdKey}
                modelIdKey={pref.modelIdKey}
                currentProviderId={settings[pref.providerIdKey]}
                currentModelId={settings[pref.modelIdKey]}
                providerModels={audioProviderModels}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function RecordingsSettings() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <h2 className="text-base font-bold">Recordings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure transcription and analysis behavior for recordings
        </p>
      </div>
      <section className="space-y-3">
        <h3 className="text-sm font-medium">General</h3>
        <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
          <RecordingsContent />
        </React.Suspense>
      </section>
    </div>
  );
}
