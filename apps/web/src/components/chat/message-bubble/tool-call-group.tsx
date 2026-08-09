import { cn } from 'cnfast';
import { ChevronDownIcon, ClockIcon, ExternalLinkIcon, SquareIcon } from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import type { BackgroundTask, BackgroundTaskStatus } from '@stitch/shared/background-tasks/types';
import type { ToolCallStatus } from '@stitch/shared/chat/stream-events';

import {
  getToolCallActions,
  getChildSessionId,
  getToolSummary,
  type ToolCallAction,
  type ToolCallDisplayItem,
  type ToolCallSummary,
} from './tool-call-display';
import { truncateText, useStitchToolDisplayName } from './tool-call/card-primitives';

import { ConnectorIcon } from '@/components/connectors/connector-icon';
import { McpServerLogo } from '@/components/mcp/mcp-server-logo';
import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';
import { ToolKindIcon } from '@/components/tools/tool-icons';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { backgroundTasksQueryOptions, useCancelBackgroundTask } from '@/lib/queries/background-tasks';

const VISIBLE_TOOL_COUNT = 4;

type ToolCallGroupProps = { calls: ToolCallDisplayItem[]; onAbort?: () => void };

type ToolErrorDetails = { toolName: string; label: string; error: string };

const STATUS_TONE = {
  pending: 'muted',
  'in-progress': 'primary',
  completed: 'success',
  error: 'destructive',
} as const satisfies Record<ToolCallStatus, 'muted' | 'primary' | 'success' | 'destructive'>;

const STATUS_LABEL: Record<ToolCallStatus, string> = {
  pending: 'Pending',
  'in-progress': 'Running',
  completed: 'Done',
  error: 'Error',
};

const BACKGROUND_STATUS_LABEL: Record<BackgroundTaskStatus, string> = {
  running: 'Running',
  completed: 'Completed',
  error: 'Failed',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted',
};

const BACKGROUND_STATUS_TONE = {
  running: 'primary',
  completed: 'success',
  error: 'destructive',
  cancelled: 'muted',
  interrupted: 'muted',
} as const;

type ToolCallRowContextValue = {
  call: ToolCallDisplayItem;
  summary: ToolCallSummary;
  errorDetails: ToolErrorDetails | null;
  backgroundTask: BackgroundTask | undefined;
  onViewErrorDetails: (details: ToolErrorDetails) => void;
};

const ToolCallRowContext = React.createContext<ToolCallRowContextValue | null>(null);

export function ToolCallGroup({ calls, onAbort }: ToolCallGroupProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [errorDetails, setErrorDetails] = React.useState<ToolErrorDetails | null>(null);
  const hiddenCount = Math.max(0, calls.length - VISIBLE_TOOL_COUNT);
  const visibleCalls = expanded ? calls : calls.slice(hiddenCount);
  // Only animate counts that grew after mount, so restored history stays static.
  const [mountedHiddenCount] = React.useState(hiddenCount);
  const hiddenCountIncreased = hiddenCount > mountedHiddenCount;

  if (calls.length === 0) return null;

  return (
    <div className="my-space-m border-l-2 border-border-subtle pl-space-l">
      {hiddenCount > 0 ? (
        <div className={cn(hiddenCountIncreased && 'animate-in fade-in slide-in-from-top-1 duration-base')}>
          <Button
            key={hiddenCount}
            type="button"
            variant="ghost"
            size="xs"
            width="full"
            align="start"
            onClick={() => setExpanded((current) => !current)}>
            <span className={cn('transition-transform', expanded && 'rotate-180')}>
              <Icon as={ChevronDownIcon} size="xs" />
            </span>
            <Text as="span" variant="caption" tone="muted">
              {expanded ? 'Hide earlier tool calls' : `Show ${hiddenCount} earlier tool calls`}
            </Text>
          </Button>
        </div>
      ) : null}

      <div className="space-y-space-2xs">
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
  const params = useParams({ strict: false });
  const childSessionId = getChildSessionId(call.result);
  const isBackgroundTask = call.toolName === 'task' && Boolean(params.id && childSessionId);
  const { data: backgroundTasks } = useQuery({
    ...backgroundTasksQueryOptions(params.id ?? ''),
    enabled: isBackgroundTask,
  });
  const backgroundTask = backgroundTasks?.find((task) => task.childSessionId === childSessionId);
  const baseSummary = getToolSummary(call, displayName);
  const summary =
    backgroundTask?.status === 'error' && backgroundTask.error
      ? { ...baseSummary, preview: truncateText(backgroundTask.error, 96) }
      : baseSummary;
  const isActive = call.status === 'pending' || call.status === 'in-progress';
  const errorDetails =
    backgroundTask?.status === 'error' && backgroundTask.error
      ? { toolName: call.toolName, label: summary.label, error: backgroundTask.error }
      : call.status === 'error' && call.error
        ? { toolName: call.toolName, label: summary.label, error: call.error }
        : null;
  const actions = getToolCallActions(call);

  return (
    <ToolCallRow.Root
      call={call}
      summary={summary}
      errorDetails={errorDetails}
      backgroundTask={backgroundTask}
      onViewErrorDetails={onViewErrorDetails}
      animateIn={animateIn && isActive}>
      <ToolCallRow.Icon />
      <ToolCallRow.Label />
      <ToolCallRow.Preview />
      <ToolCallRow.Meta />
      <ToolCallRow.Status />
      {isActive && onAbort ? <ToolCallRow.StopButton onAbort={onAbort} /> : null}
      {backgroundTask?.status === 'running' ? <BackgroundTaskCancelButton task={backgroundTask} /> : null}
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
  backgroundTask,
  onViewErrorDetails,
  animateIn,
  children,
}: {
  call: ToolCallDisplayItem;
  summary: ToolCallSummary;
  errorDetails: ToolErrorDetails | null;
  backgroundTask: BackgroundTask | undefined;
  onViewErrorDetails: (details: ToolErrorDetails) => void;
  animateIn: boolean;
  children: React.ReactNode;
}) {
  const contextValue = React.useMemo(
    () => ({ call, summary, errorDetails, backgroundTask, onViewErrorDetails }),
    [call, summary, errorDetails, backgroundTask, onViewErrorDetails],
  );

  return (
    <ToolCallRowContext.Provider value={contextValue}>
      <div
        className={cn(
          'group flex min-h-7 min-w-0 items-center gap-space-m rounded-md px-space-s transition-colors hover:bg-accent',
          animateIn && 'animate-in fade-in slide-in-from-top-1 duration-base',
        )}>
        {children}
      </div>
    </ToolCallRowContext.Provider>
  );
}

function ToolCallRowIcon() {
  const { call, summary, backgroundTask } = useToolCallRow();
  return <ToolStatusIcon status={call.status} summary={summary} backgroundStatus={backgroundTask?.status} />;
}

function ToolCallRowLabel() {
  const { summary } = useToolCallRow();
  return (
    <span className="shrink-0">
      <Text as="span" variant="label">
        {summary.label}
      </Text>
    </span>
  );
}

function ToolCallRowPreview() {
  const { summary, errorDetails, onViewErrorDetails } = useToolCallRow();

  if (!errorDetails) {
    return (
      <span className="min-w-0 flex-1">
        <Text as="span" variant="caption" tone="muted" truncate>
          {summary.preview}
        </Text>
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant="quiet"
      size="inline"
      align="start"
      onClick={() => onViewErrorDetails(errorDetails)}
      className="min-w-0 flex-1 truncate"
      title="View full error">
      <Text as="span" variant="caption" tone="muted" truncate>
        {summary.preview}
      </Text>
    </Button>
  );
}

function ToolCallRowMeta() {
  const { summary } = useToolCallRow();
  return (
    <div className="hidden h-5 w-44 shrink-0 items-center justify-end sm:flex">
      <Text as="span" variant="micro" tone="faint" align="right" truncate>
        {summary.meta}
      </Text>
    </div>
  );
}

function ToolCallRowStatus() {
  const { call, errorDetails, backgroundTask, onViewErrorDetails } = useToolCallRow();

  if (backgroundTask && !errorDetails) {
    return (
      <span className="flex h-5 w-16 shrink-0 items-center justify-end">
        <Text as="span" variant="micro" tone={BACKGROUND_STATUS_TONE[backgroundTask.status]} align="right">
          {BACKGROUND_STATUS_LABEL[backgroundTask.status]}
        </Text>
      </span>
    );
  }

  if (!errorDetails) {
    return (
      <span className="flex h-5 w-12 shrink-0 items-center justify-end">
        <Text as="span" variant="micro" tone={STATUS_TONE[call.status]} align="right">
          {STATUS_LABEL[call.status]}
        </Text>
      </span>
    );
  }

  return (
    <span className="flex h-5 w-12 shrink-0 items-center justify-end">
      <Button
        type="button"
        variant="destructive-quiet"
        size="inline"
        onClick={() => onViewErrorDetails(errorDetails)}
        className="hover:underline"
        title="View full error">
        {backgroundTask?.status === 'error' ? BACKGROUND_STATUS_LABEL.error : STATUS_LABEL[call.status]}
      </Button>
    </span>
  );
}

function ToolCallRowStopButton({ onAbort }: { onAbort: () => void }) {
  return (
    <Button type="button" variant="destructive-quiet" size="xs" onClick={onAbort} title="Stop running response">
      <Icon as={SquareIcon} size="xs" />
      <Text as="span" variant="micro" tone="destructive">
        Stop
      </Text>
    </Button>
  );
}

function BackgroundTaskCancelButton({ task }: { task: BackgroundTask }) {
  const cancel = useCancelBackgroundTask();
  return (
    <Button
      type="button"
      variant="destructive-quiet"
      size="xs"
      disabled={cancel.isPending}
      onClick={() => cancel.mutate(task.id)}
      title="Cancel background task">
      <Icon as={SquareIcon} size="xs" />
      <Text as="span" variant="micro" tone="destructive">
        Cancel
      </Text>
    </Button>
  );
}

function ToolCallRowActions({ actions }: { actions: ToolCallAction[] }) {
  return actions.map((action) => (
    <Button
      key={`${action.type}-${action.sessionId}`}
      variant="quiet"
      size="xs"
      title="Open child session"
      nativeButton={false}
      render={<Link to="/session/$id" params={{ id: action.sessionId }} />}>
      <Icon as={ExternalLinkIcon} size="xs" />
      <Text as="span" variant="micro" tone="muted">
        Open
      </Text>
    </Button>
  ));
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
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] gap-space-l overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-space-3xl">Tool error</DialogTitle>
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
        <pre className="max-h-[min(28rem,60vh)] overflow-auto rounded-lg border bg-surface-sunken p-space-l text-xs whitespace-pre-wrap text-foreground">
          {details?.error}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

function ToolStatusIcon({
  status,
  summary,
  backgroundStatus,
}: {
  status: ToolCallStatus;
  summary: ToolCallSummary;
  backgroundStatus?: BackgroundTaskStatus;
}) {
  if (backgroundStatus === 'running') {
    return <Spinner size="sm" tone="primary" className="shrink-0" />;
  }

  if (status === 'pending') {
    return <Icon as={ClockIcon} size="s" color="var(--muted-foreground)" />;
  }

  if (status === 'in-progress') {
    return <Spinner size="sm" tone="primary" className="shrink-0" />;
  }

  if (summary.connectorIconSlug) {
    return (
      <ConnectorIcon
        icon={{ type: 'simpleIcons', slug: summary.connectorIconSlug }}
        className={cn(
          'size-3.5 shrink-0',
          backgroundStatus === 'cancelled' || backgroundStatus === 'interrupted'
            ? 'bg-muted-foreground'
            : status === 'error' || backgroundStatus === 'error'
              ? 'bg-destructive'
              : 'bg-success',
        )}
      />
    );
  }

  if (summary.mcpServerId) {
    return <McpServerLogo serverId={summary.mcpServerId} name={summary.label} className="size-3.5" />;
  }

  return (
    <ToolKindIcon
      kind={summary.kind}
      className={cn(
        'size-3.5 shrink-0',
        backgroundStatus === 'cancelled' || backgroundStatus === 'interrupted'
          ? 'text-muted-foreground'
          : status === 'error' || backgroundStatus === 'error'
            ? 'text-destructive'
            : 'text-success',
      )}
    />
  );
}
