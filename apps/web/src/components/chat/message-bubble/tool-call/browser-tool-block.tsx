import { ChevronRightIcon, GlobeIcon } from 'lucide-react';
import * as React from 'react';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { cn } from '@/lib/utils';

import { ToolCard, truncateText } from './card-primitives';

function getBrowserArgs(args: unknown): {
  action: string | null;
  url: string | null;
  ref: string | null;
  text: string | null;
  key: string | null;
  tabId: string | null;
  profile: string | null;
} {
  const value = args as Record<string, unknown> | null | undefined;
  if (!value) {
    return { action: null, url: null, ref: null, text: null, key: null, tabId: null, profile: null };
  }

  return {
    action: typeof value.action === 'string' ? value.action : null,
    url: typeof value.url === 'string' ? value.url : null,
    ref: typeof value.ref === 'string' ? value.ref : null,
    text: typeof value.text === 'string' ? value.text : null,
    key: typeof value.key === 'string' ? value.key : null,
    tabId: typeof value.tabId === 'string' ? value.tabId : null,
    profile: typeof value.profile === 'string' ? value.profile : null,
  };
}

function getBrowserActionLabel(args: ReturnType<typeof getBrowserArgs>): string {
  const { action, url, ref, text, key, tabId } = args;
  if (!action) return 'Waiting...';

  switch (action) {
    case 'snapshot':
      return 'Taking page snapshot';
    case 'navigate':
      return url ? `Navigate to ${truncateText(url, 60)}` : 'Navigate';
    case 'click':
      return ref ? `Click element ${ref}` : 'Click';
    case 'type':
      return ref ? `Type into ${ref}${text ? `: "${truncateText(text, 40)}"` : ''}` : 'Type';
    case 'press':
      return key ? `Press ${key}` : 'Press key';
    case 'hover':
      return ref ? `Hover over ${ref}` : 'Hover';
    case 'select':
      return ref ? `Select option in ${ref}` : 'Select';
    case 'scroll':
      return ref ? `Scroll ${ref} into view` : 'Scroll';
    case 'screenshot':
      return 'Taking screenshot';
    case 'go_back':
      return 'Go back';
    case 'go_forward':
      return 'Go forward';
    case 'tab_new':
      return url ? `Open new tab: ${truncateText(url, 60)}` : 'Open new tab';
    case 'tab_list':
      return 'List tabs';
    case 'tab_focus':
      return tabId ? `Switch to ${tabId}` : 'Switch tab';
    case 'tab_close':
      return tabId ? `Close ${tabId}` : 'Close tab';
    case 'evaluate':
      return 'Run JavaScript';
    case 'wait':
      return 'Waiting';
    case 'resize':
      return 'Resize viewport';
    default:
      return action;
  }
}

type BrowserToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args: unknown;
  result?: unknown;
  error?: string;
};

export function BrowserToolBlock({ toolName, status, args, result, error }: BrowserToolBlockProps) {
  const [open, setOpen] = React.useState(false);
  const browserArgs = getBrowserArgs(args);
  const actionLabel = getBrowserActionLabel(browserArgs);
  const profileBadge = browserArgs.profile === 'user' ? 'User profile' : null;

  const resultOutput = (result as { output?: string } | undefined)?.output;
  const hasExpandableContent = Boolean(error || resultOutput);

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <button
          type="button"
          onClick={() => hasExpandableContent && setOpen((current) => !current)}
          aria-expanded={open}
          className={cn(
            'group flex min-w-0 flex-1 items-center justify-start gap-2 text-left text-foreground',
            !hasExpandableContent && 'cursor-default',
          )}
        >
          <ToolCard.StatusIndicator status={status} />
          <span className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-2">
              <ToolCard.Title>{toolName}</ToolCard.Title>
              {profileBadge ? (
                <span className="inline-flex items-center gap-1 rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <GlobeIcon className="size-2.5" />
                  {profileBadge}
                </span>
              ) : null}
            </span>
            <ToolCard.TitleContent truncate className="mt-1 block">
              {actionLabel}
            </ToolCard.TitleContent>
          </span>
          {hasExpandableContent ? (
            <ChevronRightIcon
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-90',
              )}
            />
          ) : null}
        </button>
      </ToolCard.Header>

      <ToolCard.Content open={open}>
        <div className="space-y-1.5">
          {error ? (
            <>
              <div className="font-medium text-destructive">Error</div>
              <div className="font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
                {error}
              </div>
            </>
          ) : null}
          {resultOutput ? (
            <>
              <div className="font-medium text-foreground">Output</div>
              <div className="max-h-64 overflow-auto font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
                {resultOutput.length > 2000 ? `${resultOutput.slice(0, 2000)}\n\n[...truncated]` : resultOutput}
              </div>
            </>
          ) : null}
        </div>
      </ToolCard.Content>
    </ToolCard.Root>
  );
}
