import {
  ArrowLeftIcon,
  BotIcon,
  EllipsisIcon,
  GlobeIcon,
  InfoIcon,
  PencilLineIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';

import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDialogContext } from '@/context/dialog-context';
import { sessionQueryOptions } from '@/lib/queries/chat';
import { cn } from '@/lib/utils';

export type SessionPageHeaderProps = {
  sessionId: string;
  rightPanel: 'closed' | 'details' | 'browser';
  hasBrowser: boolean;
  onToggleDetails: () => void;
  onToggleBrowser: () => void;
  onDeleteSession: () => void;
  onGenerateAutomation: () => void;
  generateAutomationPending?: boolean;
};

export function SessionPageHeader({
  sessionId,
  rightPanel,
  hasBrowser,
  onToggleDetails,
  onToggleBrowser,
  onDeleteSession,
  onGenerateAutomation,
  generateAutomationPending = false,
}: SessionPageHeaderProps) {
  const { setRenameSessionOpen } = useDialogContext();
  const { data: session } = useSuspenseQuery(sessionQueryOptions(sessionId));

  const isChildSession = session.parentSessionId !== null;

  return (
    <header className="border-b border-border/60 bg-muted/40">
      <div className="mx-auto flex h-12 w-full items-center justify-between px-6">
        <div className="flex min-w-0 items-center gap-2">
          {isChildSession ? (
            <Link
              to="/session/$id"
              params={{ id: session.parentSessionId! }}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ArrowLeftIcon className="size-4" />
              <span className="hidden sm:inline">Back to parent</span>
            </Link>
          ) : null}
          <h1 className="flex min-w-0 items-center gap-2 truncate text-base font-medium">
            {isChildSession ? (
              <Badge variant="soft" size="xs">
                <BotIcon className="size-2.5" />
                Child session
              </Badge>
            ) : null}
            <span className="truncate">{session.title ?? 'New conversation'}</span>
          </h1>
        </div>

        <div className="flex items-center gap-1">
          {!isChildSession && hasBrowser ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn('hidden lg:inline-flex', rightPanel === 'browser' && 'bg-accent')}
              onClick={onToggleBrowser}
              aria-label={rightPanel === 'browser' ? 'Hide browser' : 'Show browser'}>
              <GlobeIcon className="size-4" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('hidden lg:inline-flex', rightPanel === 'details' && 'bg-accent')}
            onClick={onToggleDetails}
            aria-label={rightPanel === 'details' ? 'Hide session details' : 'Show session details'}>
            <InfoIcon className="size-4" />
          </Button>

          {!isChildSession ? (
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
                <DropdownMenuItem onClick={onGenerateAutomation} disabled={generateAutomationPending}>
                  <SparklesIcon className="size-4" />
                  {generateAutomationPending ? 'Generating...' : 'Generate automation'}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onDeleteSession}>
                  <Trash2Icon className="size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
