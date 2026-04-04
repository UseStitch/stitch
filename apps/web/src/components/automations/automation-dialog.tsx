import * as React from 'react';

import type {
  Automation,
  AutomationSchedule,
  GeneratedAutomationDraft,
} from '@stitch/shared/automations/types';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { CronExpressionBuilder } from '@/components/cron-expression-builder';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getAutomationScheduleLabel } from '@/lib/automations/schedule-label';
import type { ProviderModels } from '@/lib/queries/providers';

type AutomationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  automation?: Automation;
  providerModels: ProviderModels[];
  prefill?: GeneratedAutomationDraft | null;
  onSubmit: (
    input: {
      providerId: string;
      modelId: string;
      title: string;
      initialMessage: string;
      schedule: AutomationSchedule | null;
    },
    action: 'create' | 'create-view' | 'save',
  ) => Promise<void>;
  isPending: boolean;
  timezone: string;
};

function getInitialSelection(providerModels: ProviderModels[]): { providerId: string; modelId: string } | null {
  const provider = providerModels[0];
  const model = provider?.models[0];
  if (!provider || !model) return null;
  return { providerId: provider.providerId, modelId: model.id };
}

export function AutomationDialog({
  open,
  onOpenChange,
  mode,
  automation,
  providerModels,
  prefill,
  onSubmit,
  isPending,
  timezone,
}: AutomationDialogProps) {
  const [title, setTitle] = React.useState('');
  const [initialMessage, setInitialMessage] = React.useState('');
  const [providerId, setProviderId] = React.useState('');
  const [modelId, setModelId] = React.useState('');
  const [isScheduled, setIsScheduled] = React.useState(false);
  const [scheduleType, setScheduleType] = React.useState<'interval' | 'cron'>('interval');
  const [editorView, setEditorView] = React.useState<'prompt' | 'preview' | 'schedule'>('prompt');
  const [intervalMinutes, setIntervalMinutes] = React.useState('60');
  const [cronExpression, setCronExpression] = React.useState('0 9 * * *');

  React.useEffect(() => {
    if (!open) return;

    if (mode === 'edit' && automation) {
      setTitle(automation.title);
      setInitialMessage(automation.initialMessage);
      setProviderId(automation.providerId);
      setModelId(automation.modelId);
      const schedule = automation.schedule;
      if (!schedule) {
        setIsScheduled(false);
        setScheduleType('interval');
        setEditorView('prompt');
        setIntervalMinutes('60');
        setCronExpression('0 9 * * *');
      } else if (schedule.type === 'interval') {
        setIsScheduled(true);
        setScheduleType('interval');
        setEditorView('schedule');
        setIntervalMinutes(String(schedule.everyMinutes));
      } else {
        setIsScheduled(true);
        setScheduleType('cron');
        setEditorView('schedule');
        setCronExpression(schedule.expression);
      }
      return;
    }

    const initialSelection = getInitialSelection(providerModels);
    setTitle(prefill?.title ?? '');
    setInitialMessage(prefill?.prompt ?? '');
    setProviderId(prefill?.providerId ?? initialSelection?.providerId ?? '');
    setModelId(prefill?.modelId ?? initialSelection?.modelId ?? '');
    setIsScheduled(false);
    setScheduleType('interval');
    setEditorView('prompt');
    setIntervalMinutes('60');
    setCronExpression('0 9 * * *');
  }, [open, mode, automation, providerModels, prefill]);

  const selectedProvider = providerModels.find((provider) => provider.providerId === providerId) ?? null;
  const availableModels = React.useMemo(() => selectedProvider?.models ?? [], [selectedProvider]);
  const selectedProviderLabel = selectedProvider?.providerName ?? null;
  const selectedModelLabel =
    availableModels.find((model) => model.id === modelId)?.name ??
    providerModels.flatMap((provider) => provider.models).find((model) => model.id === modelId)?.name ??
    null;

  React.useEffect(() => {
    if (!selectedProvider) return;
    const hasCurrentModel = availableModels.some((model) => model.id === modelId);
    if (!hasCurrentModel) {
      setModelId(availableModels[0]?.id ?? '');
    }
  }, [selectedProvider, availableModels, modelId]);

  const parsedIntervalMinutes = Number.parseInt(intervalMinutes, 10);
  const isIntervalValid = Number.isInteger(parsedIntervalMinutes) && parsedIntervalMinutes >= 1;
  const isCronValid = cronExpression.trim().length > 0;
  const intervalSummaryMinutes = Number.isInteger(parsedIntervalMinutes) && parsedIntervalMinutes >= 1 ? parsedIntervalMinutes : 1;
  const triggerLabel = isScheduled ? 'Scheduled' : 'Manual';
  const scheduleTypeLabel = scheduleType === 'interval' ? 'Interval' : 'Cron';
  const scheduleSummary = getAutomationScheduleLabel(
    !isScheduled
      ? null
      : scheduleType === 'interval'
        ? { type: 'interval', everyMinutes: intervalSummaryMinutes }
        : { type: 'cron', expression: cronExpression.trim() },
  );

  const canSubmit =
    title.trim().length > 0 &&
    initialMessage.trim().length > 0 &&
    providerId.length > 0 &&
    modelId.length > 0 &&
    (!isScheduled || (scheduleType === 'interval' ? isIntervalValid : isCronValid)) &&
    !isPending;

  const handleSubmit = async (action: 'create' | 'create-view' | 'save') => {
    if (!canSubmit) return;

    const schedule: AutomationSchedule | null = !isScheduled
      ? null
      : scheduleType === 'interval'
        ? { type: 'interval', everyMinutes: parsedIntervalMinutes }
        : { type: 'cron', expression: cronExpression.trim() };

    await onSubmit(
      {
      title: title.trim(),
      initialMessage: initialMessage.trim(),
      providerId,
      modelId,
      schedule,
      },
      action,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>{mode === 'create' ? 'Create automation' : 'Edit automation'}</DialogTitle>
      </DialogHeader>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(1080px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0 sm:max-w-none">
        <div className="border-b border-border/60 px-6 py-5">
          <h2 className="text-xl font-semibold tracking-tight">
            {mode === 'create' ? 'Create automation' : 'Edit automation'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Save a reusable model + prompt pair for recurring tasks.
          </p>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
          <div className="space-y-5 overflow-y-auto border-b border-border/50 bg-muted/10 px-6 py-5 lg:border-r lg:border-b-0">
            <div className="space-y-1.5">
              <Label htmlFor="automation-title">Title</Label>
              <Input
                id="automation-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Daily standup prep"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={providerId} onValueChange={(value) => setProviderId(value ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue>{selectedProviderLabel ?? 'Select provider'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {providerModels.map((provider) => (
                    <SelectItem key={provider.providerId} value={provider.providerId}>
                      {provider.providerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Model</Label>
              <Select value={modelId} onValueChange={(value) => setModelId(value ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue>{selectedModelLabel ?? 'Select model'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Trigger</Label>
              <Select
                value={isScheduled ? 'scheduled' : 'manual'}
                onValueChange={(value) => {
                  const scheduled = value === 'scheduled';
                  setIsScheduled(scheduled);
                  if (scheduled) {
                    setEditorView('schedule');
                  } else {
                    setEditorView('prompt');
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{triggerLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isScheduled ? (
              <div className="space-y-1.5">
                <Label>Schedule type</Label>
                <Select
                  value={scheduleType}
                  onValueChange={(value) => setScheduleType(value === 'cron' ? 'cron' : 'interval')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{scheduleTypeLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interval">Interval</SelectItem>
                    <SelectItem value="cron">Cron</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="rounded-lg border border-border/60 bg-card/70 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Current schedule</p>
              <p className="mt-1 text-sm text-foreground">{scheduleSummary}</p>
            </div>
          </div>

          <div className="flex min-h-0 flex-col px-6 py-5">
            <div className="mb-3 inline-flex w-fit gap-1 rounded-lg border border-border/60 bg-muted/20 p-1">
              <Button
                type="button"
                size="sm"
                variant={editorView === 'prompt' ? 'secondary' : 'ghost'}
                onClick={() => setEditorView('prompt')}
              >
                Prompt
              </Button>
              <Button
                type="button"
                size="sm"
                variant={editorView === 'preview' ? 'secondary' : 'ghost'}
                onClick={() => setEditorView('preview')}
              >
                Preview
              </Button>
              <Button
                type="button"
                size="sm"
                variant={editorView === 'schedule' ? 'secondary' : 'ghost'}
                onClick={() => {
                  if (!isScheduled) return;
                  setEditorView('schedule');
                }}
                disabled={!isScheduled}
              >
                Schedule
              </Button>
            </div>

            {editorView === 'preview' ? (
              <div className="flex min-h-0 flex-1 flex-col space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Prompt preview</Label>
                  <span className="text-xs text-muted-foreground">Markdown</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/60 bg-muted/10 p-3">
                  {initialMessage.trim() ? (
                    <ChatMarkdown text={initialMessage} />
                  ) : (
                    <p className="text-sm text-muted-foreground">Prompt preview appears here.</p>
                  )}
                </div>
              </div>
            ) : editorView === 'prompt' || !isScheduled ? (
              <div className="flex min-h-0 flex-1 flex-col space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="automation-message">Initial prompt</Label>
                  <span className="text-xs text-muted-foreground">{initialMessage.length} chars</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  This message is used to kick off the session when the automation runs.
                </p>
                <div className="flex min-h-0 flex-1 rounded-xl border border-border/60 bg-muted/15 p-3">
                  <Textarea
                    id="automation-message"
                    value={initialMessage}
                    onChange={(event) => setInitialMessage(event.target.value)}
                    placeholder="Write the prompt that should be sent when this automation starts..."
                    className="min-h-55 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-1 text-sm leading-6 shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col space-y-3">
                {scheduleType === 'interval' ? (
                  <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/15 p-3">
                    <Label htmlFor="automation-interval">Every (minutes)</Label>
                    <Input
                      id="automation-interval"
                      type="number"
                      min={1}
                      step={1}
                      value={intervalMinutes}
                      onChange={(event) => setIntervalMinutes(event.target.value)}
                    />
                    {!isIntervalValid ? (
                      <p className="text-xs text-destructive">Interval must be at least 1 minute.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Automation will run repeatedly based on this minute interval.</p>
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col space-y-2">
                    <Label>Cron schedule</Label>
                    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/60 bg-muted/15 p-3">
                      <CronExpressionBuilder value={cronExpression} onChange={setCronExpression} timezone={timezone} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border/60 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          {mode === 'create' ? (
            <>
              <Button variant="outline" onClick={() => void handleSubmit('create')} disabled={!canSubmit}>
                {isPending ? 'Creating...' : 'Create'}
              </Button>
              <Button onClick={() => void handleSubmit('create-view')} disabled={!canSubmit}>
                {isPending ? 'Creating...' : 'Create and View'}
              </Button>
            </>
          ) : (
            <Button onClick={() => void handleSubmit('save')} disabled={!canSubmit}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
