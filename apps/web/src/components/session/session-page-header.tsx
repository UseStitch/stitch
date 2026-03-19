import { EllipsisIcon, InfoIcon, PencilLineIcon, Trash2Icon } from 'lucide-react';

import { useSuspenseQuery } from '@tanstack/react-query';
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

type SessionPageHeaderProps = {
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onDeleteSession: () => void;
};

export function SessionPageHeader({
  detailsOpen,
  onToggleDetails,
  onDeleteSession,
}: SessionPageHeaderProps) {
  const { setRenameSessionOpen } = useDialogContext();
  const { id } = useParams({ from: '/session/$id' });
  const { data: session } = useSuspenseQuery(sessionQueryOptions(id));

  return (
    <header className="border-b border-border/60 bg-muted/40">
      <div className="mx-auto flex h-12 w-full items-center justify-between px-6">
        <h1 className="truncate text-base font-medium">{session.title ?? 'New conversation'}</h1>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden lg:inline-flex"
            onClick={onToggleDetails}
            aria-label={detailsOpen ? 'Hide session details' : 'Show session details'}
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
