import { BotIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import type { Automation } from '@stitch/shared/automations/types';

import { AutomationDialog } from '@/components/automations/automation-dialog';
import { AutomationRunsTable } from '@/components/automations/automation-runs-table';
import { AutomationsTable } from '@/components/automations/automations-table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import {
  Page,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeaderContent,
  PageIcon,
  PageTitle,
} from '@/components/ui/page';
import { getAutomationScheduleLabel, getUpcomingRuns } from '@/lib/automations/schedule-label';
import {
  automationSessionsQueryOptions,
  automationQueryOptions,
  automationsPageQueryOptions,
  automationsSidebarListQueryOptions,
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
  const { data: sidebarAutomations } = useSuspenseQuery(automationsSidebarListQueryOptions);
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const { data: automationsPage } = useSuspenseQuery(
    automationsPageQueryOptions({ page, pageSize }),
  );
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);
  const { data: settings } = useQuery(settingsQueryOptions);
  const { data: automationDetail = null } = useQuery({
    ...automationQueryOptions(automationId ?? ''),
    enabled: automationId !== undefined,
  });

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

  const selectedAutomation = automationId ? automationDetail : null;

  const editingAutomation = editingAutomationId
    ? (automationsPage.automations.find((automation) => automation.id === editingAutomationId) ??
      sidebarAutomations.find((automation) => automation.id === editingAutomationId) ??
      null)
    : null;

  const { data: automationSessions = [] } = useQuery({
    ...automationSessionsQueryOptions(selectedAutomation?.id ?? ''),
    enabled: selectedAutomation !== null,
  });

  const [automationToDelete, setAutomationToDelete] = useState<Automation | null>(null);

  useEffect(() => {
    if (automationsPage.totalPages === 0 && page !== 1) {
      setPage(1);
      return;
    }
    if (automationsPage.totalPages > 0 && page > automationsPage.totalPages) {
      setPage(automationsPage.totalPages);
    }
  }, [automationsPage.totalPages, page]);

  const handleDelete = (automation: Automation) => {
    setAutomationToDelete(automation);
  };

  const confirmDelete = async () => {
    if (!automationToDelete) return;

    try {
      await deleteAutomation.mutateAsync(automationToDelete.id);
      if (automationId === automationToDelete.id) {
        void navigate({ to: '/automations' });
      }
      toast.success('Automation deleted');
      setAutomationToDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete automation');
    }
  };

  const handleRun = async (automation: Automation) => {
    try {
      const result = await runAutomation.mutateAsync(automation.id);
      toast.success(`Started ${automation.title}`);
      void navigate({
        to: '/automations/sessions/$id',
        params: { id: result.sessionId },
        viewTransition: true,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to run automation');
    }
  };

  const modelLabelByKey = new Map<string, string>();
  for (const provider of providerModels) {
    for (const model of provider.models) {
      modelLabelByKey.set(
        `${provider.providerId}:${model.id}`,
        `${provider.providerName} / ${model.name}`,
      );
    }
  }

  const pageTitle = selectedAutomation ? selectedAutomation.title : 'Automations';
  const pageDescription = selectedAutomation
    ? 'Automation details and run history.'
    : 'Manage reusable prompts and model presets for recurring tasks.';
  const timezone =
    settings?.['profile.timezone']?.trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'UTC';
  const selectedScheduleLabel = selectedAutomation
    ? getAutomationScheduleLabel(selectedAutomation.schedule)
    : 'Manual';
  const upcomingRuns = selectedAutomation
    ? getUpcomingRuns(selectedAutomation.schedule, 3, timezone)
    : [];

  return (
    <Page>
      <PageContent>
        <PageHeader>
          <PageHeaderContent>
            <PageIcon>
              <BotIcon className="size-5" />
            </PageIcon>
            <div>
              <PageTitle>{pageTitle}</PageTitle>
              <PageDescription>{pageDescription}</PageDescription>
            </div>
          </PageHeaderContent>
          <Button onClick={openCreateDialog}>
            <PlusIcon data-icon="inline-start" className="size-4" />
            New automation
          </Button>
        </PageHeader>

        {automationsPage.total === 0 ? (
          <AutomationsTable
            automations={[]}
            providerModels={providerModels}
            page={1}
            totalPages={0}
            runPending={runAutomation.isPending}
            deletePending={deleteAutomation.isPending}
            onPageChange={setPage}
            onRun={(automation) => void handleRun(automation)}
            onEdit={openEditDialog}
            onDelete={(automation) => handleDelete(automation)}
          />
        ) : selectedAutomation ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-card/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-base font-semibold">{selectedAutomation.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {modelLabelByKey.get(
                      `${selectedAutomation.providerId}:${selectedAutomation.modelId}`,
                    ) ?? selectedAutomation.modelId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedAutomation.runCount} total runs
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      Schedule: {selectedScheduleLabel}
                    </span>
                    {upcomingRuns.length > 0 && (
                      <span className="text-xs text-muted-foreground">· Next runs:</span>
                    )}
                    {upcomingRuns.map((run) => (
                      <span
                        key={run}
                        className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {run}
                      </span>
                    ))}
                  </div>
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(selectedAutomation.id)}
                  >
                    <PencilIcon data-icon="inline-start" className="size-4" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(selectedAutomation)}
                    disabled={deleteAutomation.isPending}
                  >
                    <Trash2Icon data-icon="inline-start" className="size-4 text-destructive" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>

            {automationSessions.length === 0 ? (
              <Empty>
                <EmptyTitle>No runs yet</EmptyTitle>
                <EmptyDescription>
                  Trigger this automation to create the first run session.
                </EmptyDescription>
              </Empty>
            ) : (
              <AutomationRunsTable
                sessions={automationSessions}
                onOpen={(sessionId) =>
                  void navigate({
                    to: '/automations/sessions/$id',
                    params: { id: sessionId },
                    viewTransition: true,
                  })
                }
              />
            )}
          </div>
        ) : (
          <AutomationsTable
            automations={automationsPage.automations}
            providerModels={providerModels}
            page={automationsPage.page}
            totalPages={automationsPage.totalPages}
            runPending={runAutomation.isPending}
            deletePending={deleteAutomation.isPending}
            onPageChange={setPage}
            onRun={(automation) => void handleRun(automation)}
            onEdit={openEditDialog}
            onDelete={(automation) => handleDelete(automation)}
          />
        )}
      </PageContent>

      <AutomationDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateDialog();
        }}
        mode="create"
        providerModels={providerModels}
        isPending={createAutomation.isPending}
        timezone={timezone}
        onSubmit={async (input, action) => {
          try {
            const created = await createAutomation.mutateAsync(input);
            closeCreateDialog();
            toast.success('Automation created');
            if (action === 'create-view') {
              void navigate({
                to: '/automations/$automationId',
                params: { automationId: created.id },
              });
            }
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
        onSubmit={async (input, _action) => {
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

      <Dialog
        open={automationToDelete !== null}
        onOpenChange={(open) => !open && setAutomationToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Automation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the automation "{automationToDelete?.title}"? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAutomationToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={deleteAutomation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
