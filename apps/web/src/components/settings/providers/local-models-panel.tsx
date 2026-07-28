import { PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { useForm, useStore } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { LocalProviderId } from '@stitch/shared/providers/types';

import { SettingsIconButtonTooltip } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError, fieldErrorMessage } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { serverRequest } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import {
  discoverLocalModelsQueryOptions,
  localModelKeys,
  localModelsQueryOptions,
  type DiscoveredModel,
  type LocalModality,
  type LocalModel,
  type LocalModelInput,
} from '@/lib/queries/local-models';

type Props = { provider: LocalProviderId };

type ModelFormState = {
  id: string;
  name: string;
  contextWindow: string;
  inputLimit: string;
  outputLimit: string;
  inputCostPerMillion: string;
  outputCostPerMillion: string;
  cacheReadCostPerMillion: string;
  cacheWriteCostPerMillion: string;
  supportsToolCalls: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  inputModalities: LocalModality[];
  outputModalities: LocalModality[];
};

const ALL_MODALITIES: LocalModality[] = ['text', 'audio', 'image', 'video', 'pdf'];

const DEFAULT_FORM: ModelFormState = {
  id: '',
  name: '',
  contextWindow: '8192',
  inputLimit: '',
  outputLimit: '8192',
  inputCostPerMillion: '0',
  outputCostPerMillion: '0',
  cacheReadCostPerMillion: '',
  cacheWriteCostPerMillion: '',
  supportsToolCalls: false,
  supportsVision: false,
  supportsReasoning: false,
  inputModalities: ['text'],
  outputModalities: ['text'],
};

const modelFormSchema = z.object({
  id: z.string().trim().min(1, 'Model ID is required'),
  name: z.string().trim().min(1, 'Display Name is required'),
  contextWindow: z.string(),
  inputLimit: z.string(),
  outputLimit: z.string(),
  inputCostPerMillion: z.string(),
  outputCostPerMillion: z.string(),
  cacheReadCostPerMillion: z.string(),
  cacheWriteCostPerMillion: z.string(),
  supportsToolCalls: z.boolean(),
  supportsVision: z.boolean(),
  supportsReasoning: z.boolean(),
  inputModalities: z.array(z.enum(ALL_MODALITIES)),
  outputModalities: z.array(z.enum(ALL_MODALITIES)),
});

function discoveredToForm(d: DiscoveredModel): ModelFormState {
  return {
    id: d.id,
    name: d.name,
    contextWindow: String(d.contextWindow ?? 8192),
    inputLimit: '',
    outputLimit: String(d.outputLimit ?? 8192),
    inputCostPerMillion: '0',
    outputCostPerMillion: '0',
    cacheReadCostPerMillion: '',
    cacheWriteCostPerMillion: '',
    supportsToolCalls: d.supportsToolCalls ?? false,
    supportsVision: d.supportsVision ?? false,
    supportsReasoning: d.supportsReasoning ?? false,
    inputModalities: d.inputModalities ?? ['text'],
    outputModalities: d.outputModalities ?? ['text'],
  };
}

function modelToForm(model: LocalModel): ModelFormState {
  return {
    id: model.id,
    name: model.name,
    contextWindow: String(model.contextWindow),
    inputLimit: model.inputLimit !== null ? String(model.inputLimit) : '',
    outputLimit: String(model.outputLimit),
    inputCostPerMillion: String(model.inputCostPerMillion),
    outputCostPerMillion: String(model.outputCostPerMillion),
    cacheReadCostPerMillion: model.cacheReadCostPerMillion !== null ? String(model.cacheReadCostPerMillion) : '',
    cacheWriteCostPerMillion: model.cacheWriteCostPerMillion !== null ? String(model.cacheWriteCostPerMillion) : '',
    supportsToolCalls: model.supportsToolCalls,
    supportsVision: model.supportsVision,
    supportsReasoning: model.supportsReasoning,
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
  };
}

function parseOptionalPositiveInt(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number.parseInt(value, 10);
  return n > 0 ? n : undefined;
}

function parseOptionalNonnegativeFloat(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number.parseFloat(value);
  return n >= 0 ? n : undefined;
}

function formToInput(form: ModelFormState): LocalModelInput {
  return {
    id: form.id.trim(),
    name: form.name.trim(),
    contextWindow: Math.max(1, Number.parseInt(form.contextWindow, 10) || 8192),
    inputLimit: parseOptionalPositiveInt(form.inputLimit),
    outputLimit: Math.max(1, Number.parseInt(form.outputLimit, 10) || 8192),
    inputCostPerMillion: Math.max(0, Number.parseFloat(form.inputCostPerMillion) || 0),
    outputCostPerMillion: Math.max(0, Number.parseFloat(form.outputCostPerMillion) || 0),
    cacheReadCostPerMillion: parseOptionalNonnegativeFloat(form.cacheReadCostPerMillion),
    cacheWriteCostPerMillion: parseOptionalNonnegativeFloat(form.cacheWriteCostPerMillion),
    supportsToolCalls: form.supportsToolCalls,
    supportsVision: form.supportsVision,
    supportsReasoning: form.supportsReasoning,
    inputModalities: form.inputModalities,
    outputModalities: form.outputModalities,
  };
}

function ModelForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial: ModelFormState;
  onSave: (input: LocalModelInput) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const form = useForm({
    defaultValues: initial,
    validators: { onMount: modelFormSchema, onChange: modelFormSchema },
    onSubmit: ({ value }) => onSave(formToInput(value)),
  });
  const values = useStore(form.store, (state) => state.values);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-3 rounded-md border p-4">
      <div className="grid grid-cols-2 gap-3">
        <form.Field name="id">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="local-model-id">Model ID</Label>
              <Input
                id="local-model-id"
                placeholder="llama3.2"
                value={field.state.value}
                aria-invalid={!!fieldErrorMessage(field.state.meta)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                required
              />
              <FieldError meta={field.state.meta} />
            </div>
          )}
        </form.Field>
        <form.Field name="name">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="local-model-name">Display Name</Label>
              <Input
                id="local-model-name"
                placeholder="Llama 3.2"
                value={field.state.value}
                aria-invalid={!!fieldErrorMessage(field.state.meta)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                required
              />
              <FieldError meta={field.state.meta} />
            </div>
          )}
        </form.Field>
      </div>

      <p className="text-xs font-medium text-muted-foreground">Token limits</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="local-context-window">
            Context <span className="text-xs text-muted-foreground">(tokens)</span>
          </Label>
          <Input
            id="local-context-window"
            type="number"
            min={1}
            placeholder="8192"
            value={values.contextWindow}
            onChange={(e) => form.setFieldValue('contextWindow', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="local-input-limit">
            Input limit <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="local-input-limit"
            type="number"
            min={1}
            placeholder="—"
            value={values.inputLimit}
            onChange={(e) => form.setFieldValue('inputLimit', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="local-output-limit">
            Output limit <span className="text-xs text-muted-foreground">(tokens)</span>
          </Label>
          <Input
            id="local-output-limit"
            type="number"
            min={1}
            placeholder="8192"
            value={values.outputLimit}
            onChange={(e) => form.setFieldValue('outputLimit', e.target.value)}
          />
        </div>
      </div>

      <p className="text-xs font-medium text-muted-foreground">
        Cost <span className="font-normal">($ per million tokens, 0 for local/free)</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="local-input-cost">Input</Label>
          <Input
            id="local-input-cost"
            type="number"
            min={0}
            step="any"
            placeholder="0"
            value={values.inputCostPerMillion}
            onChange={(e) => form.setFieldValue('inputCostPerMillion', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="local-output-cost">Output</Label>
          <Input
            id="local-output-cost"
            type="number"
            min={0}
            step="any"
            placeholder="0"
            value={values.outputCostPerMillion}
            onChange={(e) => form.setFieldValue('outputCostPerMillion', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="local-cache-read-cost">
            Cache read <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="local-cache-read-cost"
            type="number"
            min={0}
            step="any"
            placeholder="—"
            value={values.cacheReadCostPerMillion}
            onChange={(e) => form.setFieldValue('cacheReadCostPerMillion', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="local-cache-write-cost">
            Cache write <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="local-cache-write-cost"
            type="number"
            min={0}
            step="any"
            placeholder="—"
            value={values.cacheWriteCostPerMillion}
            onChange={(e) => form.setFieldValue('cacheWriteCostPerMillion', e.target.value)}
          />
        </div>
      </div>

      <p className="text-xs font-medium text-muted-foreground">Capabilities</p>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="local-tool-calls"
            checked={values.supportsToolCalls}
            onCheckedChange={(v) => form.setFieldValue('supportsToolCalls', Boolean(v))}
          />
          <Label htmlFor="local-tool-calls">Supports tool calls</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="local-vision"
            checked={values.supportsVision}
            onCheckedChange={(v) => form.setFieldValue('supportsVision', Boolean(v))}
          />
          <Label htmlFor="local-vision">Supports vision (image input)</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="local-reasoning"
            checked={values.supportsReasoning}
            onCheckedChange={(v) => form.setFieldValue('supportsReasoning', Boolean(v))}
          />
          <Label htmlFor="local-reasoning">Supports reasoning</Label>
        </div>
      </div>

      <p className="text-xs font-medium text-muted-foreground">Modalities</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Input</p>
          {ALL_MODALITIES.map((m) => (
            <div key={m} className="flex items-center gap-2">
              <Checkbox
                id={`local-input-mod-${m}`}
                checked={values.inputModalities.includes(m)}
                disabled={m === 'text'}
                onCheckedChange={(v) =>
                  form.setFieldValue(
                    'inputModalities',
                    v ? [...values.inputModalities, m] : values.inputModalities.filter((x) => x !== m),
                  )
                }
              />
              <Label htmlFor={`local-input-mod-${m}`}>{m}</Label>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Output</p>
          {ALL_MODALITIES.map((m) => (
            <div key={m} className="flex items-center gap-2">
              <Checkbox
                id={`local-output-mod-${m}`}
                checked={values.outputModalities.includes(m)}
                disabled={m === 'text'}
                onCheckedChange={(v) =>
                  form.setFieldValue(
                    'outputModalities',
                    v ? [...values.outputModalities, m] : values.outputModalities.filter((x) => x !== m),
                  )
                }
              />
              <Label htmlFor={`local-output-mod-${m}`}>{m}</Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function LocalModelsPanel({ provider }: Props) {
  const queryClient = useQueryClient();
  const { data: models = [], isLoading } = useQuery(localModelsQueryOptions(provider));
  const discoverQuery = useQuery(discoverLocalModelsQueryOptions(provider));

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [showAddForm, setShowAddForm] = React.useState(false);

  const upsertMutation = useMutation({
    mutationFn: (input: LocalModelInput) =>
      serverRequest<unknown>(`/llm/local/${provider}/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: localModelKeys.list(provider) });
      setShowAddForm(false);
      setEditingId(null);
      toast.success('Model saved', { id: 'local-model-save' });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to save model'), { id: 'local-model-save' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      serverRequest<void>(`/llm/local/${provider}/models/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: localModelKeys.list(provider) });
      toast.success('Model deleted', { id: 'local-model-delete' });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to delete model'), { id: 'local-model-delete' });
    },
  });

  async function handleDiscover() {
    const result = await discoverQuery.refetch();
    if (result.isError) {
      toast.error(result.error instanceof Error ? result.error.message : 'Failed to discover models', {
        id: 'local-discover',
      });
    }
  }

  const discovered = discoverQuery.data ?? [];
  const existingIds = new Set(models.map((m) => m.id));
  const newDiscovered = discovered.filter((d) => !existingIds.has(d.id));

  return (
    <div className="flex flex-col gap-4">
      <Separator />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Models</h3>
        <ButtonGroup>
          <Button variant="outline" size="sm" onClick={handleDiscover} disabled={discoverQuery.isFetching}>
            <RefreshCwIcon className="mr-1.5 size-3.5" />
            {discoverQuery.isFetching ? 'Discovering...' : 'Discover'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowAddForm(true);
              setEditingId(null);
            }}>
            <PlusIcon className="mr-1.5 size-3.5" />
            Add
          </Button>
        </ButtonGroup>
      </div>

      {newDiscovered.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Found {newDiscovered.length} new model{newDiscovered.length !== 1 ? 's' : ''} — click to add
          </p>
          {newDiscovered.map((d) => (
            <Button
              key={d.id}
              type="button"
              variant="ghost"
              className="h-auto justify-between rounded-sm px-2 py-1.5 hover:bg-accent"
              onClick={() => {
                const input = formToInput(discoveredToForm(d));
                upsertMutation.mutate(input);
              }}>
              <span className="font-mono">{d.id}</span>
              <PlusIcon className="size-3.5 text-muted-foreground" />
            </Button>
          ))}
        </div>
      )}

      {showAddForm && (
        <ModelForm
          initial={DEFAULT_FORM}
          onSave={(input) => upsertMutation.mutate(input)}
          onCancel={() => setShowAddForm(false)}
          isPending={upsertMutation.isPending}
        />
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading models...</p>}

      {!isLoading && models.length === 0 && !showAddForm && (
        <p className="text-sm text-muted-foreground">
          No models configured. Use Discover to find installed models, or add one manually.
        </p>
      )}

      {models.length > 0 && (
        <div className="flex flex-col gap-1">
          {models.map((model) => (
            <div key={model.id}>
              {editingId === model.id ? (
                <ModelForm
                  initial={modelToForm(model)}
                  onSave={(input) => upsertMutation.mutate(input)}
                  onCancel={() => setEditingId(null)}
                  isPending={upsertMutation.isPending}
                />
              ) : (
                <div className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-accent">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{model.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{model.id}</span>
                  </div>
                  <ButtonGroup>
                    <SettingsIconButtonTooltip label={`Edit model`}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit model`}
                        onClick={() => {
                          setEditingId(model.id);
                          setShowAddForm(false);
                        }}>
                        <PencilIcon className="size-3.5" />
                      </Button>
                    </SettingsIconButtonTooltip>
                    <SettingsIconButtonTooltip label={`Delete model`}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete model`}
                        onClick={() => deleteMutation.mutate(model.id)}
                        disabled={deleteMutation.isPending}>
                        <Trash2Icon className="size-3.5 text-destructive" />
                      </Button>
                    </SettingsIconButtonTooltip>
                  </ButtonGroup>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
