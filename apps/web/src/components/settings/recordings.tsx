import * as React from 'react';

import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { SettingsModelSelect } from '@/components/settings/model-select';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import {
  SettingPage,
  SettingRow,
  SettingRowControl,
  SettingRows,
  SettingSection,
  SliderSettingRow,
} from '@/components/settings/settings-ui';
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
  sttProviderModelsQueryOptions,
  type ProviderModels,
} from '@/lib/queries/providers';
import { audioDevicesQueryOptions, audioPermissionsQueryOptions } from '@/lib/queries/recordings';
import {
  deleteSettingMutationOptions,
  saveSettingMutationOptions,
  settingsQueryOptions,
} from '@/lib/queries/settings';

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

function PermissionStatus() {
  const { data: permissions, refetch } = useQuery(audioPermissionsQueryOptions);
  const [requesting, setRequesting] = React.useState(false);

  if (!permissions) return null;

  const micDenied = permissions.microphone === 'denied';
  const screenDenied = permissions.screenCapture !== 'granted';

  if (!micDenied && !screenDenied) return null;

  const handleGrantPermissions = async () => {
    setRequesting(true);
    try {
      if (micDenied && window.api?.permissions?.requestMicrophone) {
        await window.api.permissions.requestMicrophone();
      }
      if (screenDenied && window.api?.permissions?.openScreenCaptureSettings) {
        await window.api.permissions.openScreenCaptureSettings();
      }
      setTimeout(() => void refetch(), 2000);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-warning">Missing Permissions</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {micDenied ? <li>Microphone access is required to capture audio.</li> : null}
            {screenDenied ? (
              <li>System audio recording access is required to capture system audio.</li>
            ) : null}
          </ul>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={requesting}
          onClick={() => void handleGrantPermissions()}
        >
          {requesting ? 'Requesting...' : 'Grant Permissions'}
        </button>
      </div>
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
  const deleteInputDeviceMutation = useMutation(
    deleteSettingMutationOptions('recordings.inputDeviceId', queryClient, { silent: true }),
  );
  const deleteOutputDeviceMutation = useMutation(
    deleteSettingMutationOptions('recordings.outputDeviceId', queryClient, { silent: true }),
  );

  const currentInputDevice = settings['recordings.inputDeviceId'] ?? '';
  const currentOutputDevice = settings['recordings.outputDeviceId'] ?? '';
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
    <SettingRows>
      <SettingRow label="Input Device" description="Microphone used for recording.">
        <SettingRowControl size="lg">
          <Select
            value={currentInputDevice || SYSTEM_DEFAULT_VALUE}
            onValueChange={handleInputDeviceChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{currentInputDevice || 'System Default'}</SelectValue>
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
        </SettingRowControl>
      </SettingRow>

      <SettingRow label="Output Device" description="Speaker or system audio source for recording.">
        <SettingRowControl size="lg">
          <Select
            value={currentOutputDevice || SYSTEM_DEFAULT_VALUE}
            onValueChange={handleOutputDeviceChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{currentOutputDevice || 'System Default'}</SelectValue>
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
        </SettingRowControl>
      </SettingRow>

      <SliderSettingRow
        settingKey="recordings.speakerGain"
        label="Speaker Volume"
        description="Gain multiplier for system audio in the mix. Default is 10."
        currentValue={currentSpeakerGain}
        min={1}
        max={30}
        step={1}
        precision={0}
      />
    </SettingRows>
  );
}

function RecordingsContent() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: sttProviderModels } = useSuspenseQuery(sttProviderModelsQueryOptions);
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

  // Map STT models to ProviderModels shape for the model select component
  const transcriptionProviderModels: ProviderModels[] = sttProviderModels.map((p) => ({
    providerId: p.providerId,
    providerName: p.providerName,
    models: p.models.map((m) => ({ id: m.id, name: m.name })),
  }));

  const providerModelsForPref = (providerIdKey: string): ProviderModels[] => {
    if (providerIdKey === 'recordings.transcription.providerId') return transcriptionProviderModels;
    return audioProviderModels;
  };

  const noModelsAvailable =
    transcriptionProviderModels.length === 0 && audioProviderModels.length === 0;

  return (
    <>
      <SettingRows>
        <SettingRow
          label="Auto analyze recordings"
          description="Automatically run transcription and analysis after a recording ends."
        >
          <Switch
            checked={autoAnalyzeEnabled}
            onCheckedChange={(checked) =>
              saveAutoAnalyzeMutation.mutate(checked ? 'true' : 'false')
            }
            disabled={autoAnalyzeDisabled}
          />
        </SettingRow>
        {noModelsAvailable ? (
          <p className="py-3 text-sm text-muted-foreground">
            No audio-capable models are available for recording transcription.
          </p>
        ) : (
          RECORDING_MODEL_PREFERENCES.map((pref) => (
            <SettingRow key={pref.providerIdKey} label={pref.label} description={pref.description}>
              <SettingRowControl>
                <SettingsModelSelect
                  providerIdKey={pref.providerIdKey}
                  modelIdKey={pref.modelIdKey}
                  currentProviderId={settings[pref.providerIdKey]}
                  currentModelId={settings[pref.modelIdKey]}
                  providerModels={providerModelsForPref(pref.providerIdKey)}
                />
              </SettingRowControl>
            </SettingRow>
          ))
        )}
      </SettingRows>
      {!canEnableAutoAnalyze ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Select both a transcription model and an analysis model to enable auto analyze.
        </p>
      ) : null}
    </>
  );
}

export function RecordingsSettings() {
  const page = SETTINGS_PAGE_BY_ID.recordings;
  const Icon = page.icon;

  return (
    <SettingPage
      title={page.title}
      description={page.description}
      icon={<Icon className="size-5" />}
    >
      <PermissionStatus />
      <SettingSection title="Audio Devices" className="mt-4">
        <AudioDeviceSettings />
      </SettingSection>
      <SettingSection title="Analysis">
        <RecordingsContent />
      </SettingSection>
    </SettingPage>
  );
}
