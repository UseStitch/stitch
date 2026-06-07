import { ChevronDownIcon, ClockIcon, ExternalLinkIcon, LoaderIcon, SquareIcon } from 'lucide-react';
import * as React from 'react';

import { Link } from '@tanstack/react-router';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import {
  getToolCallActions,
  getToolSummary,
  type ToolCallAction,
  type ToolCallDisplayItem,
  type ToolCallSummary,
} from './tool-call-display';
import { useStitchToolDisplayName } from './tool-call/card-primitives';

import { ConnectorIcon } from '@/components/connectors/connector-icon';
import { McpServerLogo } from '@/components/mcp/mcp-server-logo';
import { ToolKindIcon } from '@/components/tools/tool-icons';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const VISIBLE_TOOL_COUNT = 4;

type ToolCallGroupProps = {
  calls: ToolCallDisplayItem[];
  onAbort?: () => void;
};

type ToolErrorDetails = {
  toolName: string;
  label: string;
  error: string;
};

const STATUS_CLASS: Record<ToolCallStatus, string> = {
  pending: 'text-muted-foreground',
  'in-progress': 'text-info',
  completed: 'text-success',
  error: 'text-destructive',
};

const STATUS_LABEL: Record<ToolCallStatus, string> = {
  pending: 'Pending',
  'in-progress': 'Running',
  completed: 'Done',
  error: 'Error',
};

type ToolCallRowContextValue = {
  call: ToolCallDisplayItem;
  summary: ToolCallSummary;
  errorDetails: ToolErrorDetails | null;
  onViewErrorDetails: (details: ToolErrorDetails) => void;
};

const ToolCallRowContext = React.createContext<ToolCallRowContextValue | null>(null);

export function ToolCallGroup({ calls, onAbort }: ToolCallGroupProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [errorDetails, setErrorDetails] = React.useState<ToolErrorDetails | null>(null);
  const hiddenCount = Math.max(0, calls.length - VISIBLE_TOOL_COUNT);
  const visibleCalls = expanded ? calls : calls.slice(hiddenCount);
  const previousHiddenCount = usePrevious(hiddenCount);
  const hiddenCountIncreased =
    previousHiddenCount !== undefined && hiddenCount > previousHiddenCount;

  if (calls.length === 0) return null;

  return (
    <div className="my-2 border-l-2 border-border/60 pl-3 text-xs">
      {hiddenCount > 0 ? (
        <Button
          key={hiddenCount}
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setExpanded((current) => !current)}
          className={cn(
            'h-6 w-full justify-start px-1.5 text-muted-foreground hover:bg-muted/50',
            hiddenCountIncreased && 'animate-in fade-in slide-in-from-top-1 duration-200',
          )}
        >
          <ChevronDownIcon
            className={cn('size-3 transition-transform', expanded && 'rotate-180')}
          />
          {expanded ? 'Hide earlier tool calls' : `Show ${hiddenCount} earlier tool calls`}
        </Button>
      ) : null}

      <div className="space-y-0.5">
        {visibleCalls.map((call, index) => (
          <ToolCallDisplayRow
            key={call.id}
            call={call}
            onAbort={onAbort}
            onViewErrorDetails={setErrorDetails}
            animateIn={index === visibleCalls.length - 1}
          />
        ))}
      </div>

      <ToolErrorDetailsDialog details={errorDetails} onOpenChange={setErrorDetails} />
    </div>
  );
}

function ToolCallDisplayRow({
  call,
  onAbort,
  onViewErrorDetails,
  animateIn,
}: {
  call: ToolCallDisplayItem;
  onAbort?: () => void;
  onViewErrorDetails: (details: ToolErrorDetails) => void;
  animateIn: boolean;
}) {
  const displayName = useStitchToolDisplayName(call.toolName);
  const summary = getToolSummary(call, displayName);
  const isActive = call.status === 'pending' || call.status === 'in-progress';
  const errorDetails =
    call.status === 'error' && call.error
      ? { toolName: call.toolName, label: summary.label, error: call.error }
      : null;
  const actions = getToolCallActions(call);

  return (
    <ToolCallRow.Root
      call={call}
      summary={summary}
      errorDetails={errorDetails}
      onViewErrorDetails={onViewErrorDetails}
      animateIn={animateIn && isActive}
    >
      <ToolCallRow.Icon />
      <ToolCallRow.Label />
      <ToolCallRow.Preview />
      <ToolCallRow.Meta />
      <ToolCallRow.Status />
      {isActive && onAbort ? <ToolCallRow.StopButton onAbort={onAbort} /> : null}
      <ToolCallRow.Actions actions={actions} />
    </ToolCallRow.Root>
  );
}

const ToolCallRow = {
  Root: ToolCallRowRoot,
  Icon: ToolCallRowIcon,
  Label: ToolCallRowLabel,
  Preview: ToolCallRowPreview,
  Meta: ToolCallRowMeta,
  Status: ToolCallRowStatus,
  StopButton: ToolCallRowStopButton,
  Actions: ToolCallRowActions,
};

function ToolCallRowRoot({
  call,
  summary,
  errorDetails,
  onViewErrorDetails,
  animateIn,
  children,
}: {
  call: ToolCallDisplayItem;
  summary: ToolCallSummary;
  errorDetails: ToolErrorDetails | null;
  onViewErrorDetails: (details: ToolErrorDetails) => void;
  animateIn: boolean;
  children: React.ReactNode;
}) {
  return (
    <ToolCallRowContext.Provider value={{ call, summary, errorDetails, onViewErrorDetails }}>
      <div
        className={cn(
          'group flex min-h-7 min-w-0 items-center gap-2 rounded-md px-1.5 text-xs transition-colors hover:bg-muted/40',
          animateIn && 'animate-in fade-in slide-in-from-top-1 duration-200',
        )}
      >
        {children}
      </div>
    </ToolCallRowContext.Provider>
  );
}

function ToolCallRowIcon() {
  const { call, summary } = useToolCallRow();
  return <ToolStatusIcon status={call.status} summary={summary} />;
}

function ToolCallRowLabel() {
  const { summary } = useToolCallRow();
  return <span className="shrink-0 font-medium text-foreground">{summary.label}</span>;
}

function ToolCallRowPreview() {
  const { summary, errorDetails, onViewErrorDetails } = useToolCallRow();

  if (!errorDetails) {
    return <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary.preview}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onViewErrorDetails(errorDetails)}
      className="min-w-0 flex-1 cursor-pointer truncate text-left text-muted-foreground hover:text-destructive"
      title="View full error"
    >
      {summary.preview}
    </button>
  );
}

function ToolCallRowMeta() {
  const { summary } = useToolCallRow();
  return (
    <span className="hidden h-5 w-44 shrink-0 items-center justify-end truncate text-right text-[11px] leading-none text-muted-foreground/80 sm:flex">
      {summary.meta}
    </span>
  );
}

function ToolCallRowStatus() {
  const { call, errorDetails, onViewErrorDetails } = useToolCallRow();
  const className = cn(
    'flex h-5 w-12 shrink-0 items-center justify-end text-right text-[11px] leading-none font-medium',
    STATUS_CLASS[call.status],
  );

  if (!errorDetails) {
    return <span className={className}>{STATUS_LABEL[call.status]}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onViewErrorDetails(errorDetails)}
      className={cn(className, 'cursor-pointer hover:underline')}
      title="View full error"
    >
      {STATUS_LABEL[call.status]}
    </button>
  );
}

function ToolCallRowStopButton({ onAbort }: { onAbort: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={onAbort}
      className="h-5 pr-0 pl-1.5 text-[11px] leading-none text-destructive hover:text-destructive"
      title="Stop running response"
    >
      <SquareIcon className="size-2.5" />
      <span className="leading-none">Stop</span>
    </Button>
  );
}

function ToolCallRowActions({ actions }: { actions: ToolCallAction[] }) {
  return actions.map((action) => {
    switch (action.type) {
      case 'open-child-session':
        return (
          <Button
            key={`${action.type}-${action.sessionId}`}
            variant="ghost"
            size="xs"
            className="h-5 px-1.5 text-[11px] leading-3 text-muted-foreground"
            title="Open child session"
            nativeButton={false}
            render={<Link to="/session/$id" params={{ id: action.sessionId }} />}
          >
            <ExternalLinkIcon className="size-3" />
            <span className="leading-3">Open</span>
          </Button>
        );
    }
  });
}

function useToolCallRow() {
  const context = React.useContext(ToolCallRowContext);
  if (!context) throw new Error('ToolCallRow components must be rendered inside ToolCallRow.Root');
  return context;
}

function ToolErrorDetailsDialog({
  details,
  onOpenChange,
}: {
  details: ToolErrorDetails | null;
  onOpenChange: (details: ToolErrorDetails | null) => void;
}) {
  return (
    <Dialog open={details !== null} onOpenChange={(open) => !open && onOpenChange(null)}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] gap-3 overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-16">Tool error</DialogTitle>
        </DialogHeader>
        {details ? (
          <CopyButton
            value={details.error}
            copyLabel="Copy full error"
            copiedLabel="Copied error"
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-9"
          />
        ) : null}
        <pre className="max-h-[min(28rem,60vh)] overflow-auto rounded-lg border bg-muted/30 p-3 text-xs whitespace-pre-wrap text-foreground">
          {details?.error}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

function ToolStatusIcon({ status, summary }: { status: ToolCallStatus; summary: ToolCallSummary }) {
  if (status === 'pending') {
    return <ClockIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }

  if (status === 'in-progress') {
    return <LoaderIcon className="size-3.5 shrink-0 animate-spin text-info" />;
  }

  if (summary.connectorIconSlug) {
    return (
      <ConnectorIcon
        icon={{ type: 'simpleIcons', slug: summary.connectorIconSlug }}
        className={cn('size-3.5 shrink-0', status === 'error' ? 'bg-destructive' : 'bg-success')}
      />
    );
  }

  if (summary.mcpServerId) {
    return (
      <McpServerLogo serverId={summary.mcpServerId} name={summary.label} className="size-3.5" />
    );
  }

  return (
    <ToolKindIcon
      kind={summary.kind}
      className={cn('size-3.5 shrink-0', status === 'error' ? 'text-destructive' : 'text-success')}
    />
  );
}

function usePrevious(value: number) {
  const ref = React.useRef<number>(undefined);

  React.useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}
