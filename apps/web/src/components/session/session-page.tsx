import * as React from 'react';
import { toast } from 'sonner';

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import type { GeneratedAutomationDraft } from '@stitch/shared/automations/types';

import { AutomationDialog } from '@/components/automations/automation-dialog';
import { BrowserPanel } from '@/components/browser/browser-panel';
import { SessionChatPane } from '@/components/session/session-chat-pane';
import { SessionDeleteDialog } from '@/components/session/session-delete-dialog';
import { SessionDetailsSheet } from '@/components/session/session-details-sheet';
import { SessionPageHeader, type SessionPageHeaderProps } from '@/components/session/session-page-header';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useSessionDetailsStats } from '@/hooks/session/use-session-details-stats';
import { useSessionStreamState } from '@/hooks/use-session-stream-state';
import { getErrorMessage } from '@/lib/errors';
import { appEnabledStatesQueryOptions } from '@/lib/queries/apps';
import { useCreateAutomation } from '@/lib/queries/automations';
import { useGenerateAutomationDraft, useMarkSessionRead } from '@/lib/queries/chat';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';

type SessionPageProps = { sessionId: string };

const LOCAL_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function SessionPage({ sessionId }: SessionPageProps) {
  const navigate = useNavigate();
  const { mutate: markReadMutate } = useMarkSessionRead();
  const { data: providerModels } = useSuspenseQuery({ ...visibleProviderModelsQueryOptions, select: (data) => data });
  const { data: appEnabledStates } = useQuery({
    ...appEnabledStatesQueryOptions,
    select: (data) => data.map((state) => ({ appId: state.appId, enabled: state.enabled })),
  });
  const { data: settings } = useQuery({ ...settingsQueryOptions, select: (data) => data['profile.timezone'] });
  const createAutomation = useCreateAutomation();
  const generateAutomation = useGenerateAutomationDraft();
  const details = useSessionDetailsStats(sessionId);
  const streamState = useSessionStreamState(sessionId);
  const [requestedRightPanel, setRequestedRightPanel] = React.useState<SessionPageHeaderProps['rightPanel']>('closed');
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [automationDialogOpen, setAutomationDialogOpen] = React.useState(false);
  const [generatedDraft, setGeneratedDraft] = React.useState<GeneratedAutomationDraft | null>(null);
  const lastReadCompletedMessageIdRef = React.useRef<string | null>(null);
  const timezone = settings?.trim() || LOCAL_TIMEZONE;

  const browserAppEnabled = appEnabledStates?.find((state) => state.appId === 'browser')?.enabled ?? true;
  const hasBrowser = browserAppEnabled;

  const rightPanel = requestedRightPanel === 'browser' && !hasBrowser ? 'closed' : requestedRightPanel;
  const rightPanelOpen = rightPanel !== 'closed';

  const toggleDetails = () => {
    setRequestedRightPanel((previous) => (previous === 'details' ? 'closed' : 'details'));
  };

  const toggleBrowser = () => {
    setRequestedRightPanel((previous) => (previous === 'browser' ? 'closed' : 'browser'));
  };

  React.useEffect(() => {
    return window.api.browser.onShowRequested(() => {
      if (browserAppEnabled) setRequestedRightPanel('browser');
    });
  }, [browserAppEnabled]);

  React.useEffect(() => {
    lastReadCompletedMessageIdRef.current = null;
    markReadMutate(sessionId);
  }, [sessionId, markReadMutate]);

  React.useEffect(() => {
    if (
      streamState.isStreaming ||
      streamState.activeMessageId === null ||
      streamState.finishReason === null ||
      streamState.error !== null
    ) {
      return;
    }

    if (lastReadCompletedMessageIdRef.current === streamState.activeMessageId) {
      return;
    }

    lastReadCompletedMessageIdRef.current = streamState.activeMessageId;
    markReadMutate(sessionId);
  }, [
    sessionId,
    markReadMutate,
    streamState.isStreaming,
    streamState.activeMessageId,
    streamState.finishReason,
    streamState.error,
  ]);

  const handleGenerateAutomation = async () => {
    const toastId = toast.loading('Generating automation draft...');
    try {
      const draft = await generateAutomation.mutateAsync(sessionId);
      setGeneratedDraft(draft);
      setAutomationDialogOpen(true);
      toast.success('Automation draft ready', { id: toastId });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to generate automation draft'), { id: toastId });
    }
  };

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <SessionPageHeader
          sessionId={sessionId}
          rightPanel={rightPanel}
          hasBrowser={hasBrowser}
          onToggleDetails={toggleDetails}
          onToggleBrowser={toggleBrowser}
          onDeleteSession={() => setDeleteDialogOpen(true)}
          onGenerateAutomation={() => void handleGenerateAutomation()}
          generateAutomationPending={generateAutomation.isPending}
        />

        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full min-h-0 w-full pt-space-none pr-space-none pb-space-none pl-space-2xl">
          <ResizablePanel defaultSize={rightPanelOpen ? '70%' : '100%'} minSize="45%">
            <SessionChatPane sessionId={sessionId} onGenerateAutomation={handleGenerateAutomation} />
          </ResizablePanel>

          {rightPanelOpen ? (
            <>
              <ResizableHandle className="hidden bg-border after:w-0 lg:flex" />

              <ResizablePanel defaultSize="30%" minSize="24%" maxSize="55%">
                {rightPanel === 'browser' ? (
                  <BrowserPanel sessionId={sessionId} onClose={() => setRequestedRightPanel('closed')} />
                ) : (
                  <SessionDetailsSheet {...details} sessionId={sessionId} className="hidden lg:block" />
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
        onDeleted={() => setRequestedRightPanel('closed')}
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
            toast.success('Automation created', { id: 'session-automation-create' });
            if (action === 'create-view') {
              void navigate({ to: '/automations/$automationId', params: { automationId: created.id } });
            }
          } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to create automation'), { id: 'session-automation-create' });
          }
        }}
      />
    </>
  );
}
