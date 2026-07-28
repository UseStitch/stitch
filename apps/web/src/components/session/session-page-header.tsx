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

import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
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

  const parentSessionId = session.parentSessionId;
  const isChildSession = parentSessionId !== null;

  return (
    <header className="border-b border-border-subtle bg-surface-sunken">
      <div className="mx-auto flex h-12 w-full items-center justify-between px-space-2xl">
        <div className="flex min-w-0 items-center gap-space-m">
          {isChildSession ? (
            <Link
              to="/session/$id"
              params={{ id: parentSessionId }}
              className="inline-flex items-center gap-space-s rounded-md px-space-m py-space-xs text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Icon as={ArrowLeftIcon} size="m" />
              <span className="hidden sm:inline">Back to parent</span>
            </Link>
          ) : null}
          <Stack direction="row" align="center" gap="m" grow>
            {isChildSession ? (
              <Badge variant="soft" size="xs">
                <Icon as={BotIcon} size="xs" />
                Child session
              </Badge>
            ) : null}
            <Text as="span" variant="heading-s" truncate>
              {session.title ?? 'New conversation'}
            </Text>
          </Stack>
        </div>

        <Stack direction="row" align="center" gap="xs">
          {!isChildSession && hasBrowser ? (
            <Button
              variant={rightPanel === 'browser' ? 'secondary' : 'ghost'}
              size="icon-sm"
              className="hidden lg:inline-flex"
              onClick={onToggleBrowser}
              aria-label={rightPanel === 'browser' ? 'Hide browser' : 'Show browser'}>
              <Icon as={GlobeIcon} size="m" />
            </Button>
          ) : null}
          <Button
            variant={rightPanel === 'details' ? 'secondary' : 'ghost'}
            size="icon-sm"
            className="hidden lg:inline-flex"
            onClick={onToggleDetails}
            aria-label={rightPanel === 'details' ? 'Hide session details' : 'Show session details'}>
            <Icon as={InfoIcon} size="m" />
          </Button>

          {!isChildSession ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Session actions">
                    <Icon as={EllipsisIcon} size="m" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => setRenameSessionOpen(true)}>
                  <Icon as={PencilLineIcon} size="m" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onGenerateAutomation} disabled={generateAutomationPending}>
                  <Icon as={SparklesIcon} size="m" />
                  {generateAutomationPending ? 'Generating...' : 'Generate automation'}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onDeleteSession}>
                  <Icon as={Trash2Icon} size="m" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </Stack>
      </div>
    </header>
  );
}
