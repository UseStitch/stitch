import * as React from 'react';
import { z } from 'zod';

import { useForm, useStore } from '@tanstack/react-form';

import type { Automation, AutomationSchedule, GeneratedAutomationDraft } from '@stitch/shared/automations/types';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { CronExpressionBuilder } from '@/components/cron-expression-builder';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError, fieldErrorMessage } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getAutomationScheduleLabel } from '@/lib/automations/schedule-label';
import type { ProviderModels } from '@/lib/queries/providers';

const DEFAULT_CRON_EXPRESSION = '0 9 * * *';

type EditorView = 'prompt' | 'preview' | 'schedule';

type SubmitAction = 'create' | 'create-view' | 'save';

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
    action: SubmitAction,
  ) => Promise<void>;
  isPending: boolean;
  timezone: string;
};

type AutomationFormProps = Omit<AutomationDialogProps, 'open'>;

const automationSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required'),
    initialMessage: z.string().trim().min(1, 'Prompt is required'),
    providerId: z.string().min(1, 'Select a provider'),
    modelId: z.string().min(1, 'Select a model'),
    isScheduled: z.boolean(),
    cronExpression: z.string(),
  })
  .refine((value) => !value.isScheduled || value.cronExpression.trim().length > 0, {
    message: 'Enter a schedule expression',
    path: ['cronExpression'],
  });

type AutomationFormValues = z.infer<typeof automationSchema>;

function getInitialSelection(providerModels: ProviderModels[]): { providerId: string; modelId: string } | null {
  const provider = providerModels[0];
  const model = provider?.models[0];
  if (!provider || !model) return null;
  return { providerId: provider.providerId, modelId: model.id };
}

function resolveModelId(providerModels: ProviderModels[], providerId: string, modelId: string): string {
  const provider = providerModels.find((candidate) => candidate.providerId === providerId);
  if (!provider) return modelId;
  return provider.models.some((model) => model.id === modelId) ? modelId : (provider.models[0]?.id ?? '');
}

function getInitialFormState(
  mode: 'create' | 'edit',
  automation: Automation | undefined,
  prefill: GeneratedAutomationDraft | null | undefined,
  providerModels: ProviderModels[],
): { values: AutomationFormValues; editorView: EditorView } {
  if (mode === 'edit' && automation) {
    const schedule = automation.schedule;
    return {
      values: {
        title: automation.title,
        initialMessage: automation.initialMessage,
        providerId: automation.providerId,
        modelId: resolveModelId(providerModels, automation.providerId, automation.modelId),
        isScheduled: schedule !== null,
        cronExpression: schedule?.expression ?? DEFAULT_CRON_EXPRESSION,
      },
      editorView: schedule ? 'schedule' : 'prompt',
    };
  }

  const initialSelection = getInitialSelection(providerModels);
  const providerId = prefill?.providerId ?? initialSelection?.providerId ?? '';
  return {
    values: {
      title: prefill?.title ?? '',
      initialMessage: prefill?.prompt ?? '',
      providerId,
      modelId: resolveModelId(providerModels, providerId, prefill?.modelId ?? initialSelection?.modelId ?? ''),
      isScheduled: false,
      cronExpression: DEFAULT_CRON_EXPRESSION,
    },
    editorView: 'prompt',
  };
}

export function AutomationDialog({ open, ...formProps }: AutomationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={formProps.onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>{formProps.mode === 'create' ? 'Create automation' : 'Edit automation'}</DialogTitle>
      </DialogHeader>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(1080px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0 sm:max-w-none">
        <AutomationForm {...formProps} />
      </DialogContent>
    </Dialog>
  );
}

function AutomationForm({
  onOpenChange,
  mode,
  automation,
  providerModels,
  prefill,
  onSubmit,
  isPending,
  timezone,
}: AutomationFormProps) {
  const [initial] = React.useState(() => getInitialFormState(mode, automation, prefill, providerModels));
  const [editorView, setEditorView] = React.useState<EditorView>(initial.editorView);

  const form = useForm({
    defaultValues: initial.values,
    onSubmitMeta: { action: 'save' as SubmitAction },
    validators: { onMount: automationSchema, onChange: automationSchema },
    onSubmit: async ({ value, meta }) => {
      const schedule: AutomationSchedule | null = !value.isScheduled
        ? null
        : { type: 'cron', expression: value.cronExpression.trim() };

      await onSubmit(
        {
          title: value.title.trim(),
          initialMessage: value.initialMessage.trim(),
          providerId: value.providerId,
          modelId: value.modelId,
          schedule,
        },
        meta.action,
      );
    },
  });

  React.useEffect(() => {
    if (providerModels.length === 0) return;

    const providerId = form.getFieldValue('providerId');
    const provider = providerModels.find((candidate) => candidate.providerId === providerId) ?? providerModels[0];
    const modelId = resolveModelId(providerModels, provider.providerId, form.getFieldValue('modelId'));

    if (providerId !== provider.providerId) form.setFieldValue('providerId', provider.providerId);
    if (form.getFieldValue('modelId') !== modelId) form.setFieldValue('modelId', modelId);
  }, [form, providerModels]);

  const values = useStore(form.store, (state) => state.values);

  const selectedProvider = providerModels.find((provider) => provider.providerId === values.providerId) ?? null;
  const availableModels = selectedProvider?.models ?? [];
  const selectedProviderLabel = selectedProvider?.providerName ?? null;
  const selectedModelLabel =
    availableModels.find((model) => model.id === values.modelId)?.name ??
    providerModels.flatMap((provider) => provider.models).find((model) => model.id === values.modelId)?.name ??
    null;

  const triggerLabel = values.isScheduled ? 'Scheduled' : 'Manual';
  const scheduleSummary = getAutomationScheduleLabel(
    !values.isScheduled ? null : { type: 'cron', expression: values.cronExpression.trim() },
  );

  return (
    <>
      <div className="border-b border-border-subtle px-6 py-5">
        <h2 className="text-xl font-semibold tracking-tight">
          {mode === 'create' ? 'Create automation' : 'Edit automation'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Save a reusable model + prompt pair for recurring tasks.</p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
        <div className="space-y-5 overflow-y-auto border-b border-border-subtle bg-surface-sunken px-6 py-5 lg:border-r lg:border-b-0">
          <form.Field name="title">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="automation-title">Title</Label>
                <Input
                  id="automation-title"
                  value={field.state.value}
                  placeholder="e.g. Daily standup prep"
                  aria-invalid={!!fieldErrorMessage(field.state.meta)}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>

          <form.Field
            name="providerId"
            listeners={{
              onChange: ({ value }) => {
                form.setFieldValue('modelId', resolveModelId(providerModels, value, form.getFieldValue('modelId')));
              },
            }}>
            {(field) => (
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Select value={field.state.value} onValueChange={(value) => field.handleChange(value ?? '')}>
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
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>

          <form.Field name="modelId">
            {(field) => (
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Select value={field.state.value} onValueChange={(value) => field.handleChange(value ?? '')}>
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
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>

          <form.Field name="isScheduled">
            {(field) => (
              <div className="space-y-1.5">
                <Label>Trigger</Label>
                <Select
                  value={field.state.value ? 'scheduled' : 'manual'}
                  onValueChange={(value) => {
                    const scheduled = value === 'scheduled';
                    field.handleChange(scheduled);
                    setEditorView(scheduled ? 'schedule' : 'prompt');
                  }}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{triggerLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <div className="rounded-lg border border-border-subtle bg-card/70 px-3 py-2.5">
            <p className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">Current schedule</p>
            <p className="mt-1 text-sm text-foreground">{scheduleSummary}</p>
          </div>
        </div>

        <div className="flex min-h-0 flex-col px-6 py-5">
          <div className="mb-3 inline-flex w-fit gap-1 rounded-md border border-border-subtle bg-surface-sunken p-1">
            <Button
              type="button"
              size="sm"
              variant={editorView === 'prompt' ? 'default' : 'ghost'}
              onClick={() => setEditorView('prompt')}
              className={editorView === 'prompt' ? 'bg-background text-foreground shadow-sm hover:bg-background' : ''}>
              Prompt
            </Button>
            <Button
              type="button"
              size="sm"
              variant={editorView === 'preview' ? 'default' : 'ghost'}
              onClick={() => setEditorView('preview')}
              className={editorView === 'preview' ? 'bg-background text-foreground shadow-sm hover:bg-background' : ''}>
              Preview
            </Button>
            {values.isScheduled && (
              <Button
                type="button"
                size="sm"
                variant={editorView === 'schedule' ? 'default' : 'ghost'}
                onClick={() => setEditorView('schedule')}
                className={
                  editorView === 'schedule' ? 'bg-background text-foreground shadow-sm hover:bg-background' : ''
                }>
                Schedule
              </Button>
            )}
          </div>

          {editorView === 'preview' ? (
            <div className="flex min-h-0 flex-1 flex-col space-y-2">
              <div className="flex items-center justify-between">
                <Label>Prompt preview</Label>
                <span className="text-xs text-muted-foreground">Markdown</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border-subtle bg-surface-sunken p-3">
                {values.initialMessage.trim() ? (
                  <ChatMarkdown text={values.initialMessage} />
                ) : (
                  <p className="text-sm text-muted-foreground">Prompt preview appears here.</p>
                )}
              </div>
            </div>
          ) : editorView === 'prompt' || !values.isScheduled ? (
            <form.Field name="initialMessage">
              {(field) => (
                <div className="flex min-h-0 flex-1 flex-col space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="automation-message">Initial prompt</Label>
                    <span className="text-xs text-muted-foreground">{field.state.value.length} chars</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This message is used to kick off the session when the automation runs.
                  </p>
                  <div className="flex min-h-0 flex-1 rounded-xl border border-border-subtle bg-surface-sunken p-3">
                    <Textarea
                      id="automation-message"
                      value={field.state.value}
                      placeholder="Write the prompt that should be sent when this automation starts..."
                      className="min-h-55 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-1 text-sm leading-6 shadow-none focus-visible:ring-0"
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </div>
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>
          ) : (
            <form.Field name="cronExpression">
              {(field) => (
                <div className="flex min-h-0 flex-1 flex-col space-y-2">
                  <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border-subtle bg-surface-sunken p-3">
                    <CronExpressionBuilder
                      value={field.state.value}
                      onChange={field.handleChange}
                      timezone={timezone}
                    />
                  </div>
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border-subtle px-6 py-4">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
          Cancel
        </Button>
        {mode === 'create' ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => void form.handleSubmit({ action: 'create' })}
              disabled={isPending}>
              {isPending ? 'Creating...' : 'Create'}
            </Button>
            <Button
              type="button"
              onClick={() => void form.handleSubmit({ action: 'create-view' })}
              disabled={isPending}>
              {isPending ? 'Creating...' : 'Create and View'}
            </Button>
          </>
        ) : (
          <Button type="button" onClick={() => void form.handleSubmit({ action: 'save' })} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        )}
      </div>
    </>
  );
}
