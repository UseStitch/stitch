import { PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { serverFetch } from '@/lib/api';
import {
  discoverOllamaModelsQueryOptions,
  ollamaModelKeys,
  ollamaModelsQueryOptions,
  type OllamaModality,
  type OllamaModel,
  type OllamaModelInput,
} from '@/lib/queries/ollama-models';

type Props = {
  baseURL?: string;
};

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
  inputModalities: OllamaModality[];
  outputModalities: OllamaModality[];
};

const ALL_MODALITIES: OllamaModality[] = ['text', 'audio', 'image', 'video', 'pdf'];

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

function modelToForm(model: OllamaModel): ModelFormState {
  return {
    id: model.id,
    name: model.name,
    contextWindow: String(model.contextWindow),
    inputLimit: model.inputLimit !== null ? String(model.inputLimit) : '',
    outputLimit: String(model.outputLimit),
    inputCostPerMillion: String(model.inputCostPerMillion),
    outputCostPerMillion: String(model.outputCostPerMillion),
    cacheReadCostPerMillion:
      model.cacheReadCostPerMillion !== null ? String(model.cacheReadCostPerMillion) : '',
    cacheWriteCostPerMillion:
      model.cacheWriteCostPerMillion !== null ? String(model.cacheWriteCostPerMillion) : '',
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

function formToInput(form: ModelFormState): OllamaModelInput {
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
  onSave: (input: OllamaModelInput) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = React.useState<ModelFormState>(initial);

  function set<K extends keyof ModelFormState>(key: K, value: ModelFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.id.trim() || !form.name.trim()) return;
    onSave(formToInput(form));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ollama-model-id">Model ID</Label>
          <Input
            id="ollama-model-id"
            placeholder="llama3.2"
            value={form.id}
            onChange={(e) => set('id', e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ollama-model-name">Display Name</Label>
          <Input
            id="ollama-model-name"
            placeholder="Llama 3.2"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
        </div>
      </div>

      <p className="text-xs font-medium text-muted-foreground">Token limits</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ollama-context-window">
            Context <span className="text-xs text-muted-foreground">(tokens)</span>
          </Label>
          <Input
            id="ollama-context-window"
            type="number"
            min={1}
            placeholder="8192"
            value={form.contextWindow}
            onChange={(e) => set('contextWindow', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ollama-input-limit">
            Input limit <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="ollama-input-limit"
            type="number"
            min={1}
            placeholder="—"
            value={form.inputLimit}
            onChange={(e) => set('inputLimit', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ollama-output-limit">
            Output limit <span className="text-xs text-muted-foreground">(tokens)</span>
          </Label>
          <Input
            id="ollama-output-limit"
            type="number"
            min={1}
            placeholder="8192"
            value={form.outputLimit}
            onChange={(e) => set('outputLimit', e.target.value)}
          />
        </div>
      </div>

      <p className="text-xs font-medium text-muted-foreground">
        Cost <span className="font-normal">($ per million tokens, 0 for local/free)</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ollama-input-cost">Input</Label>
          <Input
            id="ollama-input-cost"
            type="number"
            min={0}
            step="any"
            placeholder="0"
            value={form.inputCostPerMillion}
            onChange={(e) => set('inputCostPerMillion', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ollama-output-cost">Output</Label>
          <Input
            id="ollama-output-cost"
            type="number"
            min={0}
            step="any"
            placeholder="0"
            value={form.outputCostPerMillion}
            onChange={(e) => set('outputCostPerMillion', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ollama-cache-read-cost">
            Cache read <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="ollama-cache-read-cost"
            type="number"
            min={0}
            step="any"
            placeholder="—"
            value={form.cacheReadCostPerMillion}
            onChange={(e) => set('cacheReadCostPerMillion', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ollama-cache-write-cost">
            Cache write <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="ollama-cache-write-cost"
            type="number"
            min={0}
            step="any"
            placeholder="—"
            value={form.cacheWriteCostPerMillion}
            onChange={(e) => set('cacheWriteCostPerMillion', e.target.value)}
          />
        </div>
      </div>

      <p className="text-xs font-medium text-muted-foreground">Capabilities</p>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="ollama-tool-calls"
            checked={form.supportsToolCalls}
            onCheckedChange={(v) => set('supportsToolCalls', Boolean(v))}
          />
          <Label htmlFor="ollama-tool-calls">Supports tool calls</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="ollama-vision"
            checked={form.supportsVision}
            onCheckedChange={(v) => set('supportsVision', Boolean(v))}
          />
          <Label htmlFor="ollama-vision">Supports vision (image input)</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="ollama-reasoning"
            checked={form.supportsReasoning}
            onCheckedChange={(v) => set('supportsReasoning', Boolean(v))}
          />
          <Label htmlFor="ollama-reasoning">Supports reasoning</Label>
        </div>
      </div>

      <p className="text-xs font-medium text-muted-foreground">Modalities</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Input</p>
          {ALL_MODALITIES.map((m) => (
            <div key={m} className="flex items-center gap-2">
              <Checkbox
                id={`ollama-input-mod-${m}`}
                checked={form.inputModalities.includes(m)}
                disabled={m === 'text'}
                onCheckedChange={(v) =>
                  set(
                    'inputModalities',
                    v
                      ? [...form.inputModalities, m]
                      : form.inputModalities.filter((x) => x !== m),
                  )
                }
              />
              <Label htmlFor={`ollama-input-mod-${m}`}>{m}</Label>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Output</p>
          {ALL_MODALITIES.map((m) => (
            <div key={m} className="flex items-center gap-2">
              <Checkbox
                id={`ollama-output-mod-${m}`}
                checked={form.outputModalities.includes(m)}
                disabled={m === 'text'}
                onCheckedChange={(v) =>
                  set(
                    'outputModalities',
                    v
                      ? [...form.outputModalities, m]
                      : form.outputModalities.filter((x) => x !== m),
                  )
                }
              />
              <Label htmlFor={`ollama-output-mod-${m}`}>{m}</Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          disabled={isPending || !form.id.trim() || !form.name.trim()}
        >
          {isPending ? 'Saving...' : 'Save'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function OllamaModelsPanel({ baseURL }: Props) {
  const queryClient = useQueryClient();
  const { data: models = [], isLoading } = useQuery(ollamaModelsQueryOptions);
  const discoverQuery = useQuery(discoverOllamaModelsQueryOptions(baseURL));

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [showAddForm, setShowAddForm] = React.useState(false);

  const upsertMutation = useMutation({
    mutationFn: async (input: OllamaModelInput) => {
      const res = await serverFetch('/llm/ollama/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? 'Failed to save model');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ollamaModelKeys.list() });
      setShowAddForm(false);
      setEditingId(null);
      toast.success('Model saved');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save model');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await serverFetch(`/llm/ollama/models/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete model');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ollamaModelKeys.list() });
      toast.success('Model deleted');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete model');
    },
  });

  async function handleDiscover() {
    const result = await discoverQuery.refetch();
    if (result.isError) {
      toast.error(
        result.error instanceof Error ? result.error.message : 'Failed to connect to Ollama',
      );
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDiscover}
            disabled={discoverQuery.isFetching}
          >
            <RefreshCwIcon className="mr-1.5 size-3.5" />
            {discoverQuery.isFetching ? 'Discovering...' : 'Discover'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowAddForm(true);
              setEditingId(null);
            }}
          >
            <PlusIcon className="mr-1.5 size-3.5" />
            Add
          </Button>
        </div>
      </div>

      {newDiscovered.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Found {newDiscovered.length} new model{newDiscovered.length !== 1 ? 's' : ''} — click to
            add
          </p>
          {newDiscovered.map((d) => (
            <button
              key={d.id}
              type="button"
              className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                upsertMutation.mutate({
                  id: d.id,
                  name: d.name,
                  contextWindow: 8192,
                  outputLimit: 8192,
                  inputCostPerMillion: 0,
                  outputCostPerMillion: 0,
                  supportsToolCalls: false,
                  supportsVision: false,
                  supportsReasoning: false,
                  inputModalities: ['text'],
                  outputModalities: ['text'],
                });
              }}
            >
              <span className="font-mono">{d.id}</span>
              <PlusIcon className="size-3.5 text-muted-foreground" />
            </button>
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
          No models configured. Use Discover to find installed Ollama models, or add one manually.
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
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setEditingId(model.id);
                        setShowAddForm(false);
                      }}
                    >
                      <PencilIcon className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => deleteMutation.mutate(model.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2Icon className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
