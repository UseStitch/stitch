import * as React from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { SessionChatPane } from '@/components/session/session-chat-pane';
import { SessionDeleteDialog } from '@/components/session/session-delete-dialog';
import { SessionDetailsPanel } from '@/components/session/session-details-panel';
import { SessionPageHeader } from '@/components/session/session-page-header';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { agentsQueryOptions } from '@/lib/queries/agents';
import { sessionQueryOptions, sessionMessagesInfiniteQueryOptions } from '@/lib/queries/chat';
import { enabledProviderModelsQueryOptions, visibleProviderModelsQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';

export const Route = createFileRoute('/session/$id')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(sessionQueryOptions(params.id)),
      context.queryClient.ensureInfiniteQueryData(sessionMessagesInfiniteQueryOptions(params.id)),
      context.queryClient.ensureQueryData(agentsQueryOptions),
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(settingsQueryOptions),
    ]),
  component: SessionComponent,
});

function SessionComponent() {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <SessionPageHeader
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsOpen((open) => !open)}
          onDeleteSession={() => setDeleteDialogOpen(true)}
        />

        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full min-h-0 w-full pl-6 pr-0 pt-0 pb-0"
        >
          <ResizablePanel defaultSize={detailsOpen ? '70%' : '100%'} minSize="45%">
            <SessionChatPane />
          </ResizablePanel>

          {detailsOpen ? (
            <>
              <ResizableHandle className="hidden lg:flex bg-foreground/25 after:w-0" />

              <ResizablePanel defaultSize="30%" minSize="24%" maxSize="38%">
                <SessionDetailsPanel className="hidden lg:block" />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>

      <SessionDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDeleted={() => setDetailsOpen(false)}
      />
    </>
  );
}
