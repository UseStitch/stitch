import * as React from 'react';

import { createFileRoute } from '@tanstack/react-router';

import type { QueuedMessageAttachment } from '@stitch/shared/chat/queue';

import { MessageQueuePanel } from '@/components/session/message-queue-panel';
import { SessionChatPane } from '@/components/session/session-chat-pane';
import { SessionDeleteDialog } from '@/components/session/session-delete-dialog';
import { SessionDetailsPanel } from '@/components/session/session-details-panel';
import { SessionPageHeader } from '@/components/session/session-page-header';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { agentsQueryOptions } from '@/lib/queries/agents';
import {
  sessionQueryOptions,
  sessionMessagesInfiniteQueryOptions,
  useMarkSessionRead,
} from '@/lib/queries/chat';
import {
  enabledProviderModelsQueryOptions,
  visibleProviderModelsQueryOptions,
} from '@/lib/queries/providers';
import { queuedMessagesQueryOptions } from '@/lib/queries/queue';
import { settingsQueryOptions } from '@/lib/queries/settings';

export type RightPanel = 'closed' | 'details' | 'queue';

export type EditQueuedMessagePayload = {
  content: string;
  attachments: QueuedMessageAttachment[];
};

export type SendQueuedMessageFn = (content: string, attachments: QueuedMessageAttachment[]) => void;

export const Route = createFileRoute('/session/$id')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(sessionQueryOptions(params.id)),
      context.queryClient.ensureInfiniteQueryData(sessionMessagesInfiniteQueryOptions(params.id)),
      context.queryClient.ensureQueryData(agentsQueryOptions),
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(settingsQueryOptions),
      context.queryClient.ensureQueryData(queuedMessagesQueryOptions(params.id)),
    ]),
  component: SessionComponent,
});

function SessionComponent() {
  const { id } = Route.useParams();
  const { mutate: markReadMutate } = useMarkSessionRead();
  const [rightPanel, setRightPanel] = React.useState<RightPanel>('closed');
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [editPayload, setEditPayload] = React.useState<EditQueuedMessagePayload | null>(null);
  const sendQueuedRef = React.useRef<SendQueuedMessageFn | null>(null);

  const rightPanelOpen = rightPanel !== 'closed';

  const toggleDetails = React.useCallback(() => {
    setRightPanel((prev) => (prev === 'details' ? 'closed' : 'details'));
  }, []);

  const toggleQueue = React.useCallback(() => {
    setRightPanel((prev) => (prev === 'queue' ? 'closed' : 'queue'));
  }, []);

  const openQueue = React.useCallback(() => {
    setRightPanel('queue');
  }, []);

  React.useEffect(() => {
    markReadMutate(id);
  }, [id, markReadMutate]);

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
                  <SessionDetailsPanel className="hidden lg:block" />
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
