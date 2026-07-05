import { HelpCircleIcon, PlusIcon, SaveIcon, TrashIcon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { AppEnableSetting } from '@/components/settings/app-enable-setting';
import { SettingsModelSelect } from '@/components/settings/model-select';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import {
  SettingPage,
  SettingRow,
  SettingRowControl,
  SettingRows,
  SettingSection,
  SettingsIconButtonTooltip,
} from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  enabledProviderModelsQueryOptions,
  sttProviderModelsQueryOptions,
  type ProviderModels,
} from '@/lib/queries/providers';
import {
  audioDevicesQueryOptions,
  audioPermissionsQueryOptions,
  meetingNoteTemplatesQueryOptions,
  useCreateMeetingNoteTemplate,
  useDeleteMeetingNoteTemplate,
  useUpdateMeetingNoteTemplate,
} from '@/lib/queries/recordings';
import { deleteSettingMutationOptions, saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';

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

const EMPTY_TEMPLATE_CONTENT = '# Meeting Notes\n\n## Summary\n- \n\n## Decisions\n- \n\n## Action Items\n- [ ] \n';

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
      if (screenDenied) {
        // Prime triggers the native prompt; fall back to System Settings if still denied.
        const status = await window.api?.recording?.primeSystemAudio?.();
        if (status?.screenCapture !== 'granted') {
          await window.api?.permissions?.openScreenCaptureSettings?.();
        }
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
            {screenDenied ? <li>System audio recording access is required to capture system audio.</li> : null}
          </ul>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={requesting}
          onClick={() => void handleGrantPermissions()}>
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
          <Select value={currentInputDevice || SYSTEM_DEFAULT_VALUE} onValueChange={handleInputDeviceChange}>
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
          <Select value={currentOutputDevice || SYSTEM_DEFAULT_VALUE} onValueChange={handleOutputDeviceChange}>
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
    </SettingRows>
  );
}

function RecordingsContent() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: sttProviderModels } = useSuspenseQuery(sttProviderModelsQueryOptions);
  const { data: llmProviderModels } = useSuspenseQuery(enabledProviderModelsQueryOptions);
  const { data: templateData } = useSuspenseQuery(meetingNoteTemplatesQueryOptions);
  const saveAutoAnalyzeMutation = useMutation(
    saveSettingMutationOptions('recordings.autoAnalyze', queryClient, { silent: true }),
  );
  const saveDefaultTemplateMutation = useMutation(
    saveSettingMutationOptions('recordings.analysis.defaultTemplateId', queryClient, { silent: true }),
  );

  const autoAnalyzeEnabled = settings['recordings.autoAnalyze'] === 'true';
  const defaultTemplateId = settings['recordings.analysis.defaultTemplateId'];
  const defaultTemplate =
    templateData.templates.find((template) => template.id === defaultTemplateId) ?? templateData.templates[0];
  const hasTranscriptionModel =
    !!settings['recordings.transcription.providerId'] && !!settings['recordings.transcription.modelId'];
  const hasAnalysisModel = !!settings['recordings.analysis.providerId'] && !!settings['recordings.analysis.modelId'];
  const canEnableAutoAnalyze = hasTranscriptionModel && hasAnalysisModel && !!defaultTemplate;
  const autoAnalyzeDisabled = saveAutoAnalyzeMutation.isPending || (!autoAnalyzeEnabled && !canEnableAutoAnalyze);

  // Map STT models to ProviderModels shape for the model select component
  const transcriptionProviderModels: ProviderModels[] = sttProviderModels.map((p) => ({
    providerId: p.providerId,
    providerName: p.providerName,
    models: p.models.map((m) => ({ id: m.id, name: m.name })),
  }));

  const providerModelsForPref = (providerIdKey: string): ProviderModels[] => {
    if (providerIdKey === 'recordings.transcription.providerId') return transcriptionProviderModels;
    return llmProviderModels;
  };

  const noModelsAvailable = transcriptionProviderModels.length === 0 && llmProviderModels.length === 0;

  return (
    <>
      <SettingRows>
        <SettingRow
          label="Auto analyze recordings"
          description="Automatically run transcription and analysis after a recording ends.">
          <Switch
            checked={autoAnalyzeEnabled}
            onCheckedChange={(checked) => saveAutoAnalyzeMutation.mutate(checked ? 'true' : 'false')}
            disabled={autoAnalyzeDisabled}
          />
        </SettingRow>
        <SettingRow
          label="Default notes template"
          description="Template used when recordings are analyzed automatically or from the default action.">
          <SettingRowControl>
            <Select
              value={defaultTemplate?.id ?? ''}
              onValueChange={(value) => value && saveDefaultTemplateMutation.mutate(value)}
              disabled={saveDefaultTemplateMutation.isPending || templateData.templates.length === 0}>
              <SelectTrigger className="w-full">
                <SelectValue>{defaultTemplate?.name ?? 'No templates available'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {templateData.templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRowControl>
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
          Select transcription, analysis, and notes template settings to enable auto analyze.
        </p>
      ) : null}
    </>
  );
}

function MarkdownHelpDialog() {
  return (
    <Tooltip>
      <Dialog>
        <DialogTrigger
          render={
            <TooltipTrigger
              render={
                <Button variant="outline" size="icon-sm" aria-label="Markdown help">
                  <HelpCircleIcon />
                </Button>
              }
            />
          }
        />
        <TooltipContent>Markdown help</TooltipContent>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Markdown basics</DialogTitle>
            <DialogDescription>Use Markdown to shape how the note template should be filled in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium">Headings</p>
              <code className="text-xs text-muted-foreground"># Title, ## Section</code>
            </div>
            <div>
              <p className="font-medium">Lists</p>
              <code className="text-xs text-muted-foreground">- Bullet item</code>
            </div>
            <div>
              <p className="font-medium">Tasks</p>
              <code className="text-xs text-muted-foreground">- [ ] Owner: action item</code>
            </div>
            <div>
              <p className="font-medium">Emphasis</p>
              <code className="text-xs text-muted-foreground">**important** or _note_</code>
            </div>
          </div>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </Tooltip>
  );
}

function MeetingNoteTemplatesSettings() {
  const { data } = useSuspenseQuery(meetingNoteTemplatesQueryOptions);
  const createMutation = useCreateMeetingNoteTemplate();
  const updateMutation = useUpdateMeetingNoteTemplate();
  const deleteMutation = useDeleteMeetingNoteTemplate();
  const [selectedId, setSelectedId] = React.useState<string | null>(data.templates[0]?.id ?? null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const selectedTemplate = data.templates.find((template) => template.id === selectedId) ?? null;
  const [name, setName] = React.useState(selectedTemplate?.name ?? '');
  const [content, setContent] = React.useState(selectedTemplate?.content ?? EMPTY_TEMPLATE_CONTENT);

  React.useEffect(() => {
    if (!selectedTemplate) {
      setName('');
      setContent(EMPTY_TEMPLATE_CONTENT);
      return;
    }

    setName(selectedTemplate.name);
    setContent(selectedTemplate.content);
  }, [selectedTemplate]);

  React.useEffect(() => {
    if (!selectedId && data.templates[0]) {
      setSelectedId(data.templates[0].id);
    }
  }, [data.templates, selectedId]);

  const canSave = name.trim().length > 0 && selectedTemplate !== null;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  function handleCreateTemplate() {
    createMutation.mutate(
      { name: 'New Template', content: EMPTY_TEMPLATE_CONTENT },
      { onSuccess: (response) => setSelectedId(response.template.id) },
    );
  }

  function handleSaveTemplate() {
    if (!selectedTemplate) return;
    updateMutation.mutate({ id: selectedTemplate.id, template: { name, content } });
  }

  function handleDeleteTemplate() {
    if (!selectedTemplate) return;

    const nextTemplate = data.templates.find((template) => template.id !== selectedTemplate.id);
    deleteMutation.mutate(selectedTemplate.id, {
      onSuccess: () => {
        setSelectedId(nextTemplate?.id ?? null);
        setDeleteOpen(false);
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue placeholder="Select a template">{selectedTemplate?.name ?? 'Select a template'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {data.templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ButtonGroup className="shrink-0">
          <Button size="sm" onClick={handleCreateTemplate}>
            <PlusIcon />
            New Template
          </Button>
          <MarkdownHelpDialog />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="destructive"
                  size="icon-sm"
                  aria-label="Delete template"
                  disabled={!selectedTemplate || deleteMutation.isPending}
                  onClick={() => setDeleteOpen(true)}>
                  <TrashIcon />
                </Button>
              }
            />
            <TooltipContent>Delete template</TooltipContent>
          </Tooltip>
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            icon={<TrashIcon />}
            title="Delete template?"
            description={`This will permanently delete “${selectedTemplate?.name ?? 'this template'}”. This cannot be undone.`}
            onConfirm={handleDeleteTemplate}
            confirmLabel="Delete"
            pendingLabel="Delete"
            isPending={deleteMutation.isPending}
          />
          <SettingsIconButtonTooltip label="Save template">
            <Button
              size="icon-sm"
              aria-label="Save template"
              disabled={!canSave || isSaving}
              onClick={handleSaveTemplate}>
              <SaveIcon />
            </Button>
          </SettingsIconButtonTooltip>
        </ButtonGroup>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Title</Label>
        <Input value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Editor</p>
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="min-h-96 resize-y font-mono text-sm"
            placeholder="Write the markdown structure for this meeting note template."
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Preview</p>
          <div className="min-h-96 rounded-lg border bg-card p-4">
            {content.trim() ? (
              <ChatMarkdown text={content} />
            ) : (
              <p className="text-sm text-muted-foreground">Preview appears here.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecordingsSettings() {
  const page = SETTINGS_PAGE_BY_ID.recordings;
  const Icon = page.icon;

  return (
    <SettingPage title={page.title} description={page.description} icon={<Icon className="size-5" />}>
      <Tabs defaultValue="settings" className="min-h-0">
        <TabsList variant="line">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="pt-4">
          <SettingSection title="App">
            <SettingRows>
              <AppEnableSetting appId="recordings" label="Recordings" />
            </SettingRows>
          </SettingSection>
          <PermissionStatus />
          <SettingSection title="Audio Devices">
            <AudioDeviceSettings />
          </SettingSection>
          <SettingSection title="Analysis">
            <RecordingsContent />
          </SettingSection>
        </TabsContent>

        <TabsContent value="templates" className="pt-4">
          <SettingSection
            title="Meeting Note Templates"
            description="Create and edit markdown templates used to summarize meeting transcripts."
            className="mt-0">
            <MeetingNoteTemplatesSettings />
          </SettingSection>
        </TabsContent>
      </Tabs>
    </SettingPage>
  );
}
