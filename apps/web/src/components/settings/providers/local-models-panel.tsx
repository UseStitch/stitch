import { PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { useForm, useSelector } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { LocalProviderId } from '@stitch/shared/providers/types';

import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
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
  const values = useSelector(form.store, (state) => state.values);

  return (
    <div className="rounded-md border p-space-xl">
      <Stack
        as="form"
        gap="l"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}>
        <div className="grid grid-cols-2 gap-space-l">
          <form.Field name="id">
            {(field) => (
              <Stack gap="s">
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
              </Stack>
            )}
          </form.Field>
          <form.Field name="name">
            {(field) => (
              <Stack gap="s">
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
              </Stack>
            )}
          </form.Field>
        </div>

        <Text variant="label" tone="muted">
          Token limits
        </Text>
        <div className="grid grid-cols-3 gap-space-l">
          <Stack gap="s">
            <Label htmlFor="local-context-window">
              Context{' '}
              <Text variant="caption" tone="muted">
                (tokens)
              </Text>
            </Label>
            <Input
              id="local-context-window"
              type="number"
              min={1}
              placeholder="8192"
              value={values.contextWindow}
              onChange={(e) => form.setFieldValue('contextWindow', e.target.value)}
            />
          </Stack>
          <Stack gap="s">
            <Label htmlFor="local-input-limit">
              Input limit{' '}
              <Text variant="caption" tone="muted">
                (optional)
              </Text>
            </Label>
            <Input
              id="local-input-limit"
              type="number"
              min={1}
              placeholder="—"
              value={values.inputLimit}
              onChange={(e) => form.setFieldValue('inputLimit', e.target.value)}
            />
          </Stack>
          <Stack gap="s">
            <Label htmlFor="local-output-limit">
              Output limit{' '}
              <Text variant="caption" tone="muted">
                (tokens)
              </Text>
            </Label>
            <Input
              id="local-output-limit"
              type="number"
              min={1}
              placeholder="8192"
              value={values.outputLimit}
              onChange={(e) => form.setFieldValue('outputLimit', e.target.value)}
            />
          </Stack>
        </div>

        <Text variant="label" tone="muted">
          Cost ($ per million tokens, 0 for local/free)
        </Text>
        <div className="grid grid-cols-2 gap-space-l">
          <Stack gap="s">
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
          </Stack>
          <Stack gap="s">
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
          </Stack>
          <Stack gap="s">
            <Label htmlFor="local-cache-read-cost">
              Cache read{' '}
              <Text variant="caption" tone="muted">
                (optional)
              </Text>
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
          </Stack>
          <Stack gap="s">
            <Label htmlFor="local-cache-write-cost">
              Cache write{' '}
              <Text variant="caption" tone="muted">
                (optional)
              </Text>
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
          </Stack>
        </div>

        <Text variant="label" tone="muted">
          Capabilities
        </Text>
        <Stack gap="m">
          <Stack direction="row" align="center" gap="m">
            <Checkbox
              id="local-tool-calls"
              checked={values.supportsToolCalls}
              onCheckedChange={(v) => form.setFieldValue('supportsToolCalls', Boolean(v))}
            />
            <Label htmlFor="local-tool-calls">Supports tool calls</Label>
          </Stack>
          <Stack direction="row" align="center" gap="m">
            <Checkbox
              id="local-vision"
              checked={values.supportsVision}
              onCheckedChange={(v) => form.setFieldValue('supportsVision', Boolean(v))}
            />
            <Label htmlFor="local-vision">Supports vision (image input)</Label>
          </Stack>
          <Stack direction="row" align="center" gap="m">
            <Checkbox
              id="local-reasoning"
              checked={values.supportsReasoning}
              onCheckedChange={(v) => form.setFieldValue('supportsReasoning', Boolean(v))}
            />
            <Label htmlFor="local-reasoning">Supports reasoning</Label>
          </Stack>
        </Stack>

        <Text variant="label" tone="muted">
          Modalities
        </Text>
        <div className="grid grid-cols-2 gap-x-space-2xl gap-y-space-m">
          <Stack gap="s">
            <Text variant="caption" tone="muted">
              Input
            </Text>
            {ALL_MODALITIES.map((m) => (
              <Stack key={m} direction="row" align="center" gap="m">
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
              </Stack>
            ))}
          </Stack>
          <Stack gap="s">
            <Text variant="caption" tone="muted">
              Output
            </Text>
            {ALL_MODALITIES.map((m) => (
              <Stack key={m} direction="row" align="center" gap="m">
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
              </Stack>
            ))}
          </Stack>
        </div>

        <div className="flex gap-space-m pt-space-xs">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? 'Saving...' : 'Save'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Stack>
    </div>
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
      serverRequest<LocalModel>(`/llm/local/${provider}/models`, {
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
      toast.error(Error.isError(result.error) ? result.error.message : 'Failed to discover models', {
        id: 'local-discover',
      });
    }
  }

  const discovered = discoverQuery.data ?? [];
  const existingIds = new Set(models.map((m) => m.id));
  const newDiscovered = discovered.filter((d) => !existingIds.has(d.id));

  return (
    <Stack gap="xl">
      <Separator />

      <Stack direction="row" align="center" justify="between">
        <Text as="h3" variant="body-strong">
          Models
        </Text>
        <ButtonGroup>
          <Button variant="outline" size="sm" onClick={handleDiscover} disabled={discoverQuery.isFetching}>
            <span className="mr-space-s">
              <Icon as={RefreshCwIcon} size="s" />
            </span>
            {discoverQuery.isFetching ? 'Discovering...' : 'Discover'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowAddForm(true);
              setEditingId(null);
            }}>
            <span className="mr-space-s">
              <Icon as={PlusIcon} size="s" />
            </span>
            Add
          </Button>
        </ButtonGroup>
      </Stack>

      {newDiscovered.length > 0 && (
        <div className="rounded-md border p-space-l">
          <Stack gap="s">
            <Text variant="label" tone="muted">
              Found {newDiscovered.length} new model{newDiscovered.length !== 1 ? 's' : ''} — click to add
            </Text>
            {newDiscovered.map((d) => (
              <Button
                key={d.id}
                type="button"
                variant="ghost"
                size="sm"
                width="full"
                align="between"
                onClick={() => {
                  const input = formToInput(discoveredToForm(d));
                  upsertMutation.mutate(input);
                }}>
                <Text as="span" variant="code">
                  {d.id}
                </Text>
                <Text as="div" tone="muted">
                  <Icon as={PlusIcon} size="s" />
                </Text>
              </Button>
            ))}
          </Stack>
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

      {isLoading && <Text tone="muted">Loading models...</Text>}

      {!isLoading && models.length === 0 && !showAddForm && (
        <Text tone="muted">No models configured. Use Discover to find installed models, or add one manually.</Text>
      )}

      {models.length > 0 && (
        <Stack gap="xs">
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
                <div className="rounded-md px-space-m py-space-m hover:bg-accent">
                  <Stack direction="row" align="center" justify="between">
                    <Stack>
                      <Text as="span" variant="body-strong">
                        {model.name}
                      </Text>
                      <Text variant="code" tone="muted">
                        {model.id}
                      </Text>
                    </Stack>
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
                          <Icon as={PencilIcon} size="s" />
                        </Button>
                      </SettingsIconButtonTooltip>
                      <SettingsIconButtonTooltip label={`Delete model`}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete model`}
                          onClick={() => deleteMutation.mutate(model.id)}
                          disabled={deleteMutation.isPending}>
                          <Text as="div" tone="destructive">
                            <Icon as={Trash2Icon} size="s" />
                          </Text>
                        </Button>
                      </SettingsIconButtonTooltip>
                    </ButtonGroup>
                  </Stack>
                </div>
              )}
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
