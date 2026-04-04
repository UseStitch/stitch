import {
  ArrowLeftIcon,
  BotIcon,
  EllipsisIcon,
  InfoIcon,
  ListOrderedIcon,
  PencilLineIcon,
  Trash2Icon,
} from 'lucide-react';

import { useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import type { RightPanel } from '@/components/session/session-page-types';
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

type SessionPageHeaderProps = {
  sessionId: string;
  rightPanel: RightPanel;
  onToggleDetails: () => void;
  onToggleQueue: () => void;
  onDeleteSession: () => void;
};

export function SessionPageHeader({
  sessionId,
  rightPanel,
  onToggleDetails,
  onToggleQueue,
  onDeleteSession,
}: SessionPageHeaderProps) {
  const { setRenameSessionOpen } = useDialogContext();
  const { data: session } = useSuspenseQuery(sessionQueryOptions(sessionId));
  const { data: queuedMessages } = useQuery(queuedMessagesQueryOptions(sessionId));

  const queueCount = queuedMessages?.length ?? 0;
  const isChildSession = session.parentSessionId !== null;

  return (
    <header className="border-b border-border/60 bg-muted/40">
      <div className="mx-auto flex h-12 w-full items-center justify-between px-6">
        <div className="flex min-w-0 items-center gap-2">
          {isChildSession ? (
            <Link
              to="/session/$id"
              params={{ id: session.parentSessionId! }}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4" />
              <span className="hidden sm:inline">Back to parent</span>
            </Link>
          ) : null}
          <h1 className="flex min-w-0 items-center gap-2 truncate text-base font-medium">
            {isChildSession ? (
              <span className="inline-flex items-center gap-1 rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <BotIcon className="size-2.5" />
                Child session
              </span>
            ) : null}
            <span className="truncate">{session.title ?? 'New conversation'}</span>
          </h1>
        </div>

        {isChildSession ? null : (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                'relative hidden lg:inline-flex',
                rightPanel === 'queue' && 'bg-accent',
              )}
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
              aria-label={
                rightPanel === 'details' ? 'Hide session details' : 'Show session details'
              }
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
        )}
      </div>
    </header>
  );
}
