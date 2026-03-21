import { EllipsisIcon, InfoIcon, ListOrderedIcon, PencilLineIcon, Trash2Icon } from 'lucide-react';

import { useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDialogContext } from '@/context/dialog-context';
import { sessionQueryOptions } from '@/lib/queries/chat';
import { queuedMessagesQueryOptions } from '@/lib/queries/queue';
import { cn } from '@/lib/utils';
import type { RightPanel } from '@/routes/session.$id';

type SessionPageHeaderProps = {
  rightPanel: RightPanel;
  onToggleDetails: () => void;
  onToggleQueue: () => void;
  onDeleteSession: () => void;
};

export function SessionPageHeader({
  rightPanel,
  onToggleDetails,
  onToggleQueue,
  onDeleteSession,
}: SessionPageHeaderProps) {
  const { setRenameSessionOpen } = useDialogContext();
  const { id } = useParams({ from: '/session/$id' });
  const { data: session } = useSuspenseQuery(sessionQueryOptions(id));
  const { data: queuedMessages } = useQuery(queuedMessagesQueryOptions(id));

  const queueCount = queuedMessages?.length ?? 0;

  return (
    <header className="border-b border-border/60 bg-muted/40">
      <div className="mx-auto flex h-12 w-full items-center justify-between px-6">
        <h1 className="truncate text-base font-medium">{session.title ?? 'New conversation'}</h1>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('relative hidden lg:inline-flex', rightPanel === 'queue' && 'bg-accent')}
            onClick={onToggleQueue}
            aria-label={rightPanel === 'queue' ? 'Hide message queue' : 'Show message queue'}
          >
            <ListOrderedIcon className="size-4" />
            {queueCount > 0 ? (
              <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {queueCount > 9 ? '9+' : queueCount}
              </span>
            ) : null}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('hidden lg:inline-flex', rightPanel === 'details' && 'bg-accent')}
            onClick={onToggleDetails}
            aria-label={rightPanel === 'details' ? 'Hide session details' : 'Show session details'}
          >
            <InfoIcon className="size-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Session actions">
                  <EllipsisIcon className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => setRenameSessionOpen(true)}>
                <PencilLineIcon className="size-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDeleteSession}>
                <Trash2Icon className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
