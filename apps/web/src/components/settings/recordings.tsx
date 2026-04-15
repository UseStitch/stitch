import * as React from 'react';

import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  audioProviderModelsQueryOptions,
  type ProviderModels,
} from '@/lib/queries/providers';
import { audioDevicesQueryOptions, audioPermissionsQueryOptions } from '@/lib/queries/recordings';
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

const SYSTEM_DEFAULT_VALUE = '__system_default__';

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

function PermissionStatus() {
  const { data: permissions } = useQuery(audioPermissionsQueryOptions);

  if (!permissions) return null;

  const micDenied = permissions.microphone === 'denied';
  const screenDenied = permissions.screenCapture === 'denied';

  if (!micDenied && !screenDenied) return null;

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
      <p className="text-sm font-medium text-warning">Missing Permissions</p>
      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
        {micDenied ? (
          <li>
            Microphone access is denied. Go to <strong>System Settings &gt; Privacy &amp;
            Security &gt; Microphone</strong> and grant access.
          </li>
        ) : null}
        {screenDenied ? (
          <li>
            Screen recording access is denied. Go to <strong>System Settings &gt; Privacy &amp;
            Security &gt; Screen &amp; System Audio Recording</strong> and grant access.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function AudioDeviceSettings() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: devices } = useQuery(audioDevicesQueryOptions);

  const saveInputDeviceMutation = useMutation(
    saveSettingMutationOptions('recordings.inputDeviceId', queryClient, { silent: true }),
  );
  const saveOutputDeviceMutation = useMutation(
    saveSettingMutationOptions('recordings.outputDeviceId', queryClient, { silent: true }),
  );
  const saveAecMutation = useMutation(
    saveSettingMutationOptions('recordings.enableAec', queryClient, { silent: true }),
  );
  const saveSpeakerGainMutation = useMutation(
    saveSettingMutationOptions('recordings.speakerGain', queryClient, { silent: true }),
  );
  const deleteInputDeviceMutation = useMutation(
    deleteSettingMutationOptions('recordings.inputDeviceId', queryClient, { silent: true }),
  );
  const deleteOutputDeviceMutation = useMutation(
    deleteSettingMutationOptions('recordings.outputDeviceId', queryClient, { silent: true }),
  );

  const currentInputDevice = settings['recordings.inputDeviceId'] ?? '';
  const currentOutputDevice = settings['recordings.outputDeviceId'] ?? '';
  const aecEnabled = settings['recordings.enableAec'] === 'true';
  const currentSpeakerGain = Number.parseFloat(settings['recordings.speakerGain'] ?? '10') || 10;

  function handleInputDeviceChange(value: string | null) {
    if (!value || value === SYSTEM_DEFAULT_VALUE) {
      deleteInputDeviceMutation.mutate();
    } else {
      saveInputDeviceMutation.mutate(value);
    }
  }

  function handleOutputDeviceChange(value: string | null) {
    if (!value || value === SYSTEM_DEFAULT_VALUE) {
      deleteOutputDeviceMutation.mutate();
    } else {
      saveOutputDeviceMutation.mutate(value);
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-4 py-3 border-b border-border/50">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label className="text-sm font-medium">Input Device</Label>
          <p className="text-xs text-muted-foreground">
            Microphone used for recording.
          </p>
        </div>
        <div className="w-64 shrink-0">
          <Select
            value={currentInputDevice || SYSTEM_DEFAULT_VALUE}
            onValueChange={handleInputDeviceChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {currentInputDevice || 'System Default'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SYSTEM_DEFAULT_VALUE}>System Default</SelectItem>
              {devices?.microphoneDevices.map((device) => (
                <SelectItem key={device} value={device}>
                  {device}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 py-3 border-b border-border/50">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label className="text-sm font-medium">Output Device</Label>
          <p className="text-xs text-muted-foreground">
            Speaker or system audio source for recording.
          </p>
        </div>
        <div className="w-64 shrink-0">
          <Select
            value={currentOutputDevice || SYSTEM_DEFAULT_VALUE}
            onValueChange={handleOutputDeviceChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {currentOutputDevice || 'System Default'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SYSTEM_DEFAULT_VALUE}>System Default</SelectItem>
              {devices?.speakerDevices.map((device) => (
                <SelectItem key={device} value={device}>
                  {device}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 py-3 border-b border-border/50">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label className="text-sm font-medium">Echo Cancellation</Label>
          <p className="text-xs text-muted-foreground">
            Reduce echo when recording both microphone and system audio.
          </p>
        </div>
        <Switch
          checked={aecEnabled}
          onCheckedChange={(checked) => saveAecMutation.mutate(checked ? 'true' : 'false')}
        />
      </div>

      <div className="flex items-center justify-between gap-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label className="text-sm font-medium">Speaker Volume</Label>
          <p className="text-xs text-muted-foreground">
            Gain multiplier for system audio in the mix. Default is 10.
          </p>
        </div>
        <div className="flex w-40 shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{currentSpeakerGain}</span>
          <input
            type="range"
            min="1"
            max="30"
            step="1"
            value={currentSpeakerGain}
            onChange={(e) => saveSpeakerGainMutation.mutate(e.target.value)}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
        </div>
      </div>
    </div>
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
          Configure audio devices, capture settings, and analysis behavior for recordings.
        </p>
      </div>
      <PermissionStatus />
      <section className="mt-4 space-y-3">
        <h3 className="text-sm font-medium">Audio Devices</h3>
        <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
          <AudioDeviceSettings />
        </React.Suspense>
      </section>
      <section className="mt-6 space-y-3">
        <h3 className="text-sm font-medium">Analysis</h3>
        <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
          <RecordingsContent />
        </React.Suspense>
      </section>
    </div>
  );
}
