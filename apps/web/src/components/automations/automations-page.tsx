import { BotIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import type { Automation } from '@stitch/shared/automations/types';

import { AutomationDialog } from '@/components/automations/automation-dialog';
import { AutomationRunsTable } from '@/components/automations/automation-runs-table';
import { AutomationsTable } from '@/components/automations/automations-table';
import { Button } from '@/components/ui/button';
import { getAutomationScheduleLabel } from '@/lib/automations/schedule-label';
import {
  automationSessionsQueryOptions,
  automationsQueryOptions,
  useCreateAutomation,
  useDeleteAutomation,
  useRunAutomation,
  useUpdateAutomation,
} from '@/lib/queries/automations';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { useAutomationStore } from '@/stores/automation-store';

type AutomationsPageProps = {
  automationId?: string;
};

export function AutomationsPage({ automationId }: AutomationsPageProps) {
  const navigate = useNavigate();
  const { data: automations } = useSuspenseQuery(automationsQueryOptions);
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);
  const { data: settings } = useQuery(settingsQueryOptions);

  const createAutomation = useCreateAutomation();
  const updateAutomation = useUpdateAutomation();
  const deleteAutomation = useDeleteAutomation();
  const runAutomation = useRunAutomation();

  const createDialogOpen = useAutomationStore((state) => state.createDialogOpen);
  const openCreateDialog = useAutomationStore((state) => state.openCreateDialog);
  const closeCreateDialog = useAutomationStore((state) => state.closeCreateDialog);
  const editingAutomationId = useAutomationStore((state) => state.editingAutomationId);
  const openEditDialog = useAutomationStore((state) => state.openEditDialog);
  const closeEditDialog = useAutomationStore((state) => state.closeEditDialog);

  const selectedAutomation = automationId
    ? (automations.find((automation) => automation.id === automationId) ?? null)
    : null;

  const editingAutomation = editingAutomationId
    ? (automations.find((automation) => automation.id === editingAutomationId) ?? null)
    : null;

  const { data: automationSessions = [] } = useQuery({
    ...automationSessionsQueryOptions(selectedAutomation?.id ?? ''),
    enabled: selectedAutomation !== null,
  });

  const handleDelete = async (automation: Automation) => {
    const confirmed = window.confirm(`Delete automation "${automation.title}"?`);
    if (!confirmed) return;

    try {
      await deleteAutomation.mutateAsync(automation.id);
      if (automationId === automation.id) {
        void navigate({ to: '/automations' });
      }
      toast.success('Automation deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete automation');
    }
  };

  const handleRun = async (automation: Automation) => {
    try {
      const result = await runAutomation.mutateAsync(automation.id);
      toast.success(`Started ${automation.title}`);
      void navigate({ to: '/automations/sessions/$id', params: { id: result.sessionId }, viewTransition: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to run automation');
    }
  };

  const modelLabelByKey = new Map<string, string>();
  for (const provider of providerModels) {
    for (const model of provider.models) {
      modelLabelByKey.set(`${provider.providerId}:${model.id}`, `${provider.providerName} / ${model.name}`);
    }
  }

  const pageTitle = selectedAutomation ? selectedAutomation.title : 'Automations';
  const pageDescription = selectedAutomation
    ? 'Automation details and run history.'
    : 'Manage reusable prompts and model presets for recurring tasks.';
  const timezone = settings?.['profile.timezone']?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const selectedScheduleLabel = selectedAutomation
    ? getAutomationScheduleLabel(selectedAutomation.schedule)
    : 'Manual';

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BotIcon className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{pageTitle}</h1>
              <p className="text-sm text-muted-foreground">{pageDescription}</p>
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
        ) : selectedAutomation ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-card/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-base font-semibold">{selectedAutomation.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {modelLabelByKey.get(`${selectedAutomation.providerId}:${selectedAutomation.modelId}`) ??
                      selectedAutomation.modelId}
                  </p>
                  <p className="text-xs text-muted-foreground">{selectedAutomation.runCount} total runs</p>
                  <p className="text-xs text-muted-foreground">Schedule: {selectedScheduleLabel}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => void handleRun(selectedAutomation)}
                    disabled={runAutomation.isPending}
                  >
                    <PlayIcon data-icon="inline-start" className="size-4" />
                    Run
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEditDialog(selectedAutomation.id)}>
                    <PencilIcon data-icon="inline-start" className="size-4" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleDelete(selectedAutomation)}
                    disabled={deleteAutomation.isPending}
                  >
                    <Trash2Icon data-icon="inline-start" className="size-4 text-destructive" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>

            {automationSessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
                <p className="text-sm font-medium">No runs yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Trigger this automation to create the first run session.
                </p>
              </div>
            ) : (
              <AutomationRunsTable
                sessions={automationSessions}
                onOpen={(sessionId) =>
                  void navigate({ to: '/automations/sessions/$id', params: { id: sessionId }, viewTransition: true })
                }
              />
            )}
          </div>
        ) : (
          <AutomationsTable
            automations={automations}
            providerModels={providerModels}
            runPending={runAutomation.isPending}
            deletePending={deleteAutomation.isPending}
            onRun={(automation) => void handleRun(automation)}
            onEdit={openEditDialog}
            onDelete={(automation) => void handleDelete(automation)}
          />
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
        timezone={timezone}
        onSubmit={async (input) => {
          try {
            const created = await createAutomation.mutateAsync(input);
            closeCreateDialog();
            toast.success('Automation created');
            void navigate({ to: '/automations/$automationId', params: { automationId: created.id } });
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
        timezone={timezone}
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
