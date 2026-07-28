import { BotIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import type { Automation } from '@stitch/shared/automations/types';

import { AutomationDialog } from '@/components/automations/automation-dialog';
import { AutomationRunsTable } from '@/components/automations/automation-runs-table';
import { AutomationsTable } from '@/components/automations/automations-table';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
import { getErrorMessage } from '@/lib/errors';
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

type AutomationsPageProps = { automationId?: string };

const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function AutomationsPage({ automationId }: AutomationsPageProps) {
  const navigate = useNavigate();
  const { data: sidebarAutomations } = useSuspenseQuery(automationsSidebarListQueryOptions);
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const { data: automationsPage } = useSuspenseQuery(automationsPageQueryOptions({ page, pageSize }));
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
  const [archiveDeletedAutomationSessions, setArchiveDeletedAutomationSessions] = useState(false);

  // Clamp the requested page during render when the result set shrinks
  if (automationsPage.totalPages === 0 && page !== 1) {
    setPage(1);
  } else if (automationsPage.totalPages > 0 && page > automationsPage.totalPages) {
    setPage(automationsPage.totalPages);
  }

  const handleDelete = (automation: Automation) => {
    setArchiveDeletedAutomationSessions(false);
    setAutomationToDelete(automation);
  };

  const confirmDelete = async () => {
    if (!automationToDelete) return;

    try {
      await deleteAutomation.mutateAsync({
        automationId: automationToDelete.id,
        input: { archiveSessions: archiveDeletedAutomationSessions },
      });
      if (automationId === automationToDelete.id) {
        void navigate({ to: '/automations' });
      }
      toast.success('Automation deleted', { id: 'automation-delete' });
      setAutomationToDelete(null);
      setArchiveDeletedAutomationSessions(false);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete automation'), { id: 'automation-delete' });
    }
  };

  const handleRun = async (automation: Automation) => {
    try {
      const result = await runAutomation.mutateAsync(automation.id);
      toast.success(`Started ${automation.title}`, { id: 'automation-run' });
      void navigate({ to: '/automations/sessions/$id', params: { id: result.sessionId }, viewTransition: true });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to run automation'), { id: 'automation-run' });
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
  const timezone = settings?.['profile.timezone']?.trim() || LOCAL_TIME_ZONE || 'UTC';
  const selectedScheduleLabel = selectedAutomation ? getAutomationScheduleLabel(selectedAutomation.schedule) : 'Manual';
  const upcomingRuns = selectedAutomation ? getUpcomingRuns(selectedAutomation.schedule, 3, timezone) : [];

  return (
    <Page>
      <PageContent>
        <PageHeader>
          <PageHeaderContent>
            <PageIcon>
              <Icon as={BotIcon} size="l" />
            </PageIcon>
            <div>
              <PageTitle>{pageTitle}</PageTitle>
              <PageDescription>{pageDescription}</PageDescription>
            </div>
          </PageHeaderContent>
          <Button onClick={openCreateDialog}>
            <Icon as={PlusIcon} size="m" data-icon="inline-start" />
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
          <div className="space-y-space-xl">
            <div className="rounded-xl border border-border-subtle bg-card p-space-xl">
              <Stack direction="row" wrap align="start" justify="between" gap="l">
                <div className="space-y-space-xs">
                  <Text variant="heading-s">{selectedAutomation.title}</Text>
                  <Text variant="body" tone="muted">
                    {modelLabelByKey.get(`${selectedAutomation.providerId}:${selectedAutomation.modelId}`) ??
                      selectedAutomation.modelId}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {selectedAutomation.runCount} total runs
                  </Text>
                  <Stack direction="row" wrap align="center" gap="s">
                    <Text as="span" variant="caption" tone="muted">
                      Schedule: {selectedScheduleLabel}
                    </Text>
                    {upcomingRuns.length > 0 && (
                      <Text as="span" variant="caption" tone="muted">
                        · Next runs:
                      </Text>
                    )}
                    {upcomingRuns.map((run) => (
                      <Badge key={run} variant="soft" size="xs">
                        {run}
                      </Badge>
                    ))}
                  </Stack>
                </div>

                <Stack direction="row" wrap align="center" gap="m">
                  <Button
                    size="sm"
                    onClick={() => void handleRun(selectedAutomation)}
                    disabled={runAutomation.isPending}>
                    <Icon as={PlayIcon} size="m" data-icon="inline-start" />
                    Run
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEditDialog(selectedAutomation.id)}>
                    <Icon as={PencilIcon} size="m" data-icon="inline-start" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(selectedAutomation)}
                    disabled={deleteAutomation.isPending}>
                    <Icon as={Trash2Icon} size="m" tone="destructive" data-icon="inline-start" />
                    Delete
                  </Button>
                </Stack>
              </Stack>
            </div>

            {automationSessions.length === 0 ? (
              <Empty>
                <EmptyTitle>No runs yet</EmptyTitle>
                <EmptyDescription>Trigger this automation to create the first run session.</EmptyDescription>
              </Empty>
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
            toast.success('Automation created', { id: 'automation-create' });
            if (action === 'create-view') {
              void navigate({ to: '/automations/$automationId', params: { automationId: created.id } });
            }
          } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to create automation'), { id: 'automation-create' });
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
            toast.success('Automation updated', { id: 'automation-update' });
          } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update automation'), { id: 'automation-update' });
          }
        }}
      />

      <ConfirmDialog
        open={automationToDelete !== null}
        onOpenChange={(open) => {
          if (open) return;
          setAutomationToDelete(null);
          setArchiveDeletedAutomationSessions(false);
        }}
        title="Delete Automation"
        description={`Delete "${automationToDelete?.title}" and its run sessions? You can archive the sessions instead.`}
        onConfirm={() => void confirmDelete()}
        confirmLabel="Delete"
        pendingLabel="Delete"
        isPending={deleteAutomation.isPending}
        contentClassName="max-w-sm">
        <div className="rounded-lg border border-border-subtle bg-surface-sunken">
          <Text as="label" variant="body">
            <Stack direction="row" align="start" gap="l" padding="l">
              <Checkbox
                id="archive-automation-sessions"
                checked={archiveDeletedAutomationSessions}
                onCheckedChange={(checked) => setArchiveDeletedAutomationSessions(Boolean(checked))}
                disabled={deleteAutomation.isPending}
                aria-label="Archive automation sessions"
              />
              <Stack gap="xs">
                <Text as="span" variant="body-strong">
                  Archive run sessions
                </Text>
                <Text as="span" variant="body" tone="muted">
                  Keep sessions and cost data, hidden from lists.
                </Text>
              </Stack>
            </Stack>
          </Text>
        </div>
      </ConfirmDialog>
    </Page>
  );
}
