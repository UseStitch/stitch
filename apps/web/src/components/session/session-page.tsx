import * as React from 'react';

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
import { useSessionDetailsStats } from '@/hooks/session/use-session-details-stats';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useMarkSessionRead } from '@/lib/queries/chat';

type SessionPageProps = {
  sessionId: string;
};

export function SessionPage({ sessionId }: SessionPageProps) {
  const { mutate: markReadMutate } = useMarkSessionRead();
  const details = useSessionDetailsStats();
  const [rightPanel, setRightPanel] = React.useState<RightPanel>('closed');
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [editPayload, setEditPayload] = React.useState<EditQueuedMessagePayload | null>(null);
  const sendQueuedRef = React.useRef<SendQueuedMessageFn | null>(null);

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

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <SessionPageHeader
          rightPanel={rightPanel}
          onToggleDetails={toggleDetails}
          onToggleQueue={toggleQueue}
          onDeleteSession={() => setDeleteDialogOpen(true)}
        />

        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full min-h-0 w-full pt-0 pr-0 pb-0 pl-6"
        >
          <ResizablePanel defaultSize={rightPanelOpen ? '70%' : '100%'} minSize="45%">
            <SessionChatPane
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
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDeleted={() => setRightPanel('closed')}
      />
    </>
  );
}
