import * as React from 'react';

import type { Automation } from '@stitch/shared/automations/types';

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
import type { ProviderModels } from '@/lib/queries/providers';

type AutomationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  automation?: Automation;
  providerModels: ProviderModels[];
  onSubmit: (input: {
    providerId: string;
    modelId: string;
    title: string;
    initialMessage: string;
  }) => Promise<void>;
  isPending: boolean;
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
  onSubmit,
  isPending,
}: AutomationDialogProps) {
  const [title, setTitle] = React.useState('');
  const [initialMessage, setInitialMessage] = React.useState('');
  const [providerId, setProviderId] = React.useState('');
  const [modelId, setModelId] = React.useState('');

  React.useEffect(() => {
    if (!open) return;

    if (mode === 'edit' && automation) {
      setTitle(automation.title);
      setInitialMessage(automation.initialMessage);
      setProviderId(automation.providerId);
      setModelId(automation.modelId);
      return;
    }

    const initialSelection = getInitialSelection(providerModels);
    setTitle('');
    setInitialMessage('');
    setProviderId(initialSelection?.providerId ?? '');
    setModelId(initialSelection?.modelId ?? '');
  }, [open, mode, automation, providerModels]);

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

  const canSubmit =
    title.trim().length > 0 &&
    initialMessage.trim().length > 0 &&
    providerId.length > 0 &&
    modelId.length > 0 &&
    !isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit({
      title: title.trim(),
      initialMessage: initialMessage.trim(),
      providerId,
      modelId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>{mode === 'create' ? 'Create automation' : 'Edit automation'}</DialogTitle>
      </DialogHeader>
      <DialogContent className="w-[min(1080px,calc(100vw-2rem))] max-w-none overflow-hidden p-0 sm:max-w-none">
        <div className="border-b border-border/60 px-6 py-5">
          <h2 className="text-xl font-semibold tracking-tight">
            {mode === 'create' ? 'Create automation' : 'Edit automation'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Save a reusable model + prompt pair for recurring tasks.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
          <div className="space-y-5 border-b border-border/50 bg-muted/10 px-6 py-5 lg:border-r lg:border-b-0">
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
          </div>

          <div className="space-y-2 px-6 py-5">
            <div className="flex items-center justify-between">
              <Label htmlFor="automation-message">Initial prompt</Label>
              <span className="text-xs text-muted-foreground">{initialMessage.length} chars</span>
            </div>
            <p className="text-xs text-muted-foreground">
              This message is used to kick off the session when the automation runs.
            </p>
            <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
              <Textarea
                id="automation-message"
                value={initialMessage}
                onChange={(event) => setInitialMessage(event.target.value)}
                placeholder="Write the prompt that should be sent when this automation starts..."
                className="h-105 resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-1 text-sm leading-6 shadow-none focus-visible:ring-0"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border/60 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {isPending ? (mode === 'create' ? 'Creating...' : 'Saving...') : mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
