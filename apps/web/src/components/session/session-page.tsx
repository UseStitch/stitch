import * as React from 'react';
import { toast } from 'sonner';

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import type { GeneratedAutomationDraft } from '@stitch/shared/automations/types';

import { AutomationDialog } from '@/components/automations/automation-dialog';
import { MessageQueuePanel } from '@/components/session/message-queue-panel';
import { SessionChatPane } from '@/components/session/session-chat-pane';
import { SessionDeleteDialog } from '@/components/session/session-delete-dialog';
import { SessionDetailsSheet } from '@/components/session/session-details-sheet';
import { SessionPageHeader } from '@/components/session/session-page-header';
import type {
  EditQueuedMessagePayload,
  RightPanel,
  SendQueuedMessageFn,
} from '@/components/session/session-page-types';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useSessionDetailsStats } from '@/hooks/session/use-session-details-stats';
import { useCreateAutomation } from '@/lib/queries/automations';
import { useGenerateAutomationDraft, useMarkSessionRead } from '@/lib/queries/chat';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';

type SessionPageProps = {
  sessionId: string;
};

export function SessionPage({ sessionId }: SessionPageProps) {
  const navigate = useNavigate();
  const { mutate: markReadMutate } = useMarkSessionRead();
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);
  const { data: settings } = useQuery(settingsQueryOptions);
  const createAutomation = useCreateAutomation();
  const generateAutomation = useGenerateAutomationDraft();
  const details = useSessionDetailsStats(sessionId);
  const [rightPanel, setRightPanel] = React.useState<RightPanel>('closed');
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [automationDialogOpen, setAutomationDialogOpen] = React.useState(false);
  const [generatedDraft, setGeneratedDraft] = React.useState<GeneratedAutomationDraft | null>(null);
  const [editPayload, setEditPayload] = React.useState<EditQueuedMessagePayload | null>(null);
  const sendQueuedRef = React.useRef<SendQueuedMessageFn | null>(null);
  const timezone =
    settings?.['profile.timezone']?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const rightPanelOpen = rightPanel !== 'closed';

  const toggleDetails = React.useCallback(() => {
    setRightPanel((previous) => (previous === 'details' ? 'closed' : 'details'));
  }, []);

  const toggleQueue = React.useCallback(() => {
    setRightPanel((previous) => (previous === 'queue' ? 'closed' : 'queue'));
  }, []);

  const openQueue = React.useCallback(() => {
    setRightPanel('queue');
  }, []);

  React.useEffect(() => {
    markReadMutate(sessionId);
  }, [sessionId, markReadMutate]);

  const handleGenerateAutomation = React.useCallback(async () => {
    const toastId = toast.loading('Generating automation draft...');
    try {
      const draft = await generateAutomation.mutateAsync(sessionId);
      setGeneratedDraft(draft);
      setAutomationDialogOpen(true);
      toast.success('Automation draft ready', { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate automation draft', {
        id: toastId,
      });
    }
  }, [generateAutomation, sessionId]);

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <SessionPageHeader
          sessionId={sessionId}
          rightPanel={rightPanel}
          onToggleDetails={toggleDetails}
          onToggleQueue={toggleQueue}
          onDeleteSession={() => setDeleteDialogOpen(true)}
          onGenerateAutomation={() => void handleGenerateAutomation()}
          generateAutomationPending={generateAutomation.isPending}
        />

        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full min-h-0 w-full pt-0 pr-0 pb-0 pl-6"
        >
          <ResizablePanel defaultSize={rightPanelOpen ? '70%' : '100%'} minSize="45%">
            <SessionChatPane
              sessionId={sessionId}
              onOpenQueue={openQueue}
              editPayload={editPayload}
              onConsumeEditPayload={() => setEditPayload(null)}
              sendQueuedRef={sendQueuedRef}
            />
          </ResizablePanel>

          {rightPanelOpen ? (
            <>
              <ResizableHandle className="hidden bg-foreground/25 after:w-0 lg:flex" />

              <ResizablePanel defaultSize="30%" minSize="24%" maxSize="38%">
                {rightPanel === 'details' ? (
                  <SessionDetailsSheet {...details} className="hidden lg:block" />
                ) : (
                  <MessageQueuePanel
                    sessionId={sessionId}
                    className="hidden lg:block"
                    onEdit={setEditPayload}
                    sendQueuedRef={sendQueuedRef}
                  />
                )}
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>

      <SessionDeleteDialog
        sessionId={sessionId}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDeleted={() => setRightPanel('closed')}
      />

      <AutomationDialog
        open={automationDialogOpen}
        onOpenChange={(open) => {
          setAutomationDialogOpen(open);
          if (!open) {
            setGeneratedDraft(null);
          }
        }}
        mode="create"
        prefill={generatedDraft}
        providerModels={providerModels}
        isPending={createAutomation.isPending}
        timezone={timezone}
        onSubmit={async (input, action) => {
          try {
            const created = await createAutomation.mutateAsync(input);
            setAutomationDialogOpen(false);
            setGeneratedDraft(null);
            toast.success('Automation created');
            if (action === 'create-view') {
              void navigate({ to: '/automations/$automationId', params: { automationId: created.id } });
            }
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create automation');
          }
        }}
      />
    </>
  );
}
