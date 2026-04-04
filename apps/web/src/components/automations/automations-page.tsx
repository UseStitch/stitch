import { BotIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Automation } from '@stitch/shared/automations/types';

import { AutomationDialog } from '@/components/automations/automation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  automationsQueryOptions,
  useCreateAutomation,
  useDeleteAutomation,
  useUpdateAutomation,
} from '@/lib/queries/automations';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';
import { useAutomationStore } from '@/stores/automation-store';

function formatModelLabel(automation: Automation, modelLabelByKey: Map<string, string>) {
  return modelLabelByKey.get(`${automation.providerId}:${automation.modelId}`) ?? automation.modelId;
}

export function AutomationsPage() {
  const { data: automations } = useSuspenseQuery(automationsQueryOptions);
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);

  const createAutomation = useCreateAutomation();
  const updateAutomation = useUpdateAutomation();
  const deleteAutomation = useDeleteAutomation();

  const selectedAutomationId = useAutomationStore((state) => state.selectedAutomationId);
  const setSelectedAutomationId = useAutomationStore((state) => state.setSelectedAutomationId);
  const createDialogOpen = useAutomationStore((state) => state.createDialogOpen);
  const openCreateDialog = useAutomationStore((state) => state.openCreateDialog);
  const closeCreateDialog = useAutomationStore((state) => state.closeCreateDialog);
  const editingAutomationId = useAutomationStore((state) => state.editingAutomationId);
  const openEditDialog = useAutomationStore((state) => state.openEditDialog);
  const closeEditDialog = useAutomationStore((state) => state.closeEditDialog);

  React.useEffect(() => {
    if (automations.length === 0) {
      setSelectedAutomationId(null);
      return;
    }

    const selectedStillExists = automations.some((automation) => automation.id === selectedAutomationId);
    if (!selectedStillExists) {
      setSelectedAutomationId(automations[0].id);
    }
  }, [automations, selectedAutomationId, setSelectedAutomationId]);

  const editingAutomation = editingAutomationId
    ? (automations.find((automation) => automation.id === editingAutomationId) ?? null)
    : null;

  const modelLabelByKey = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const provider of providerModels) {
      for (const model of provider.models) {
        map.set(`${provider.providerId}:${model.id}`, `${provider.providerName} / ${model.name}`);
      }
    }
    return map;
  }, [providerModels]);

  const handleDelete = async (automation: Automation) => {
    const confirmed = window.confirm(`Delete automation "${automation.title}"?`);
    if (!confirmed) return;

    try {
      await deleteAutomation.mutateAsync(automation.id);
      toast.success('Automation deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete automation');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BotIcon className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Automations</h1>
              <p className="text-sm text-muted-foreground">
                Save reusable prompts to start sessions with a predefined model and message.
              </p>
            </div>
          </div>
          <Button onClick={openCreateDialog}>
            <PlusIcon data-icon="inline-start" className="size-4" />
            New automation
          </Button>
        </div>

        {automations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
            <p className="text-sm font-medium">No automations yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create your first automation to speed up recurring workflows.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {automations.map((automation) => (
              <div
                key={automation.id}
                className={`rounded-xl border bg-card/80 px-4 py-3.5 ${
                  automation.id === selectedAutomationId
                    ? 'border-primary/60 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]'
                    : 'border-border/60'
                }`}
                onClick={() => setSelectedAutomationId(automation.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{automation.title}</p>
                      <Badge variant="secondary" className="text-[11px]">
                        {formatModelLabel(automation, modelLabelByKey)}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{automation.initialMessage}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEditDialog(automation.id)}
                      aria-label={`Edit ${automation.title}`}
                    >
                      <PencilIcon className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void handleDelete(automation)}
                      aria-label={`Delete ${automation.title}`}
                      disabled={deleteAutomation.isPending}
                    >
                      <Trash2Icon className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AutomationDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateDialog();
        }}
        mode="create"
        providerModels={providerModels}
        isPending={createAutomation.isPending}
        onSubmit={async (input) => {
          try {
            const created = await createAutomation.mutateAsync(input);
            setSelectedAutomationId(created.id);
            closeCreateDialog();
            toast.success('Automation created');
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create automation');
          }
        }}
      />

      <AutomationDialog
        open={editingAutomation !== null}
        onOpenChange={(open) => {
          if (!open) closeEditDialog();
        }}
        mode="edit"
        automation={editingAutomation ?? undefined}
        providerModels={providerModels}
        isPending={updateAutomation.isPending}
        onSubmit={async (input) => {
          if (!editingAutomation) return;
          try {
            await updateAutomation.mutateAsync({ automationId: editingAutomation.id, input });
            closeEditDialog();
            toast.success('Automation updated');
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update automation');
          }
        }}
      />
    </div>
  );
}
