import { ChevronDownIcon, ClockIcon, ExternalLinkIcon, LoaderIcon, SquareIcon } from 'lucide-react';
import * as React from 'react';

import { Link } from '@tanstack/react-router';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';
import { parseMcpToolName } from '@stitch/shared/mcp/types';

import {
  formatToolDisplayName,
  truncateText,
  useStitchToolDisplayName,
} from './tool-call/card-primitives';

import { ConnectorIcon } from '@/components/connectors/connector-icon';
import { McpServerLogo } from '@/components/mcp/mcp-server-logo';
import { getToolIconKind, ToolKindIcon, type ToolIconKind } from '@/components/tools/tool-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const VISIBLE_TOOL_COUNT = 4;

type ToolSummaryKind = ToolIconKind;

type ToolCallDisplayItem = {
  id: string;
  toolName: string;
  status: ToolCallStatus;
  args?: unknown;
  result?: unknown;
  error?: string;
};

type ToolCallGroupProps = {
  calls: ToolCallDisplayItem[];
  onAbort?: () => void;
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

const GOOGLE_SERVICE_ICON_SLUGS = {
  gmail: 'gmail',
  drive: 'googledrive',
  docs: 'googledocs',
  sheets: 'googlesheets',
  calendar: 'googlecalendar',
} as const;

export function ToolCallGroup({ calls, onAbort }: ToolCallGroupProps) {
  const [expanded, setExpanded] = React.useState(false);
  const hiddenCount = Math.max(0, calls.length - VISIBLE_TOOL_COUNT);
  const visibleCalls = expanded ? calls : calls.slice(hiddenCount);
  const previousHiddenCount = usePrevious(hiddenCount);
  const hiddenCountIncreased =
    previousHiddenCount !== undefined && hiddenCount > previousHiddenCount;

  if (calls.length === 0) return null;

  return (
    <div className="my-1.5 border-l border-border/70 pl-2 text-xs">
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
          <ToolCallRow
            key={call.id}
            call={call}
            onAbort={onAbort}
            animateIn={index === visibleCalls.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

const CHILD_SESSION_TOOLS = new Set(['task', 'inspect_image']);

function isChildSessionTool(toolName: string): boolean {
  return CHILD_SESSION_TOOLS.has(toolName);
}

function getChildSessionId(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const id = (result as Record<string, unknown>).childSessionId;
  return typeof id === 'string' ? id : null;
}

function ToolCallRow({
  call,
  onAbort,
  animateIn,
}: {
  call: ToolCallDisplayItem;
  onAbort?: () => void;
  animateIn: boolean;
}) {
  if (isChildSessionTool(call.toolName)) {
    return <ChildSessionToolCallRow call={call} onAbort={onAbort} animateIn={animateIn} />;
  }

  return <DefaultToolCallRow call={call} onAbort={onAbort} animateIn={animateIn} />;
}

function DefaultToolCallRow({
  call,
  onAbort,
  animateIn,
}: {
  call: ToolCallDisplayItem;
  onAbort?: () => void;
  animateIn: boolean;
}) {
  return <ToolCallRowBase call={call} onAbort={onAbort} animateIn={animateIn} />;
}

function ChildSessionToolCallRow({
  call,
  onAbort,
  animateIn,
}: {
  call: ToolCallDisplayItem;
  onAbort?: () => void;
  animateIn: boolean;
}) {
  const childSessionId = getChildSessionId(call.result);

  return (
    <ToolCallRowBase call={call} onAbort={onAbort} animateIn={animateIn}>
      {childSessionId ? (
        <Button
          variant="ghost"
          size="xs"
          className="h-5 px-1.5 text-[11px] text-muted-foreground"
          title="Open child session"
          render={<Link to="/session/$id" params={{ id: childSessionId }} />}
        >
          <ExternalLinkIcon className="size-2.5" />
          Open
        </Button>
      ) : null}
    </ToolCallRowBase>
  );
}

function ToolCallRowBase({
  call,
  onAbort,
  animateIn,
  children,
}: {
  call: ToolCallDisplayItem;
  onAbort?: () => void;
  animateIn: boolean;
  children?: React.ReactNode;
}) {
  const displayName = useStitchToolDisplayName(call.toolName);
  const summary = getToolSummary(call, displayName);
  const isActive = call.status === 'pending' || call.status === 'in-progress';

  return (
    <div
      className={cn(
        'group flex min-h-7 min-w-0 items-center gap-2 rounded-md px-1.5 text-xs transition-colors hover:bg-muted/40',
        animateIn && isActive && 'animate-in fade-in slide-in-from-top-1 duration-200',
      )}
    >
      <ToolStatusIcon
        status={call.status}
        kind={summary.kind}
        connectorIconSlug={summary.connectorIconSlug}
        mcpServerId={summary.mcpServerId}
        label={summary.label}
      />
      <span className="shrink-0 font-medium text-foreground">{summary.label}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary.preview}</span>
      <span className="hidden h-5 w-44 shrink-0 items-center justify-end truncate text-right text-[11px] leading-none text-muted-foreground/80 sm:flex">
        {summary.meta}
      </span>
      <span
        className={cn(
          'flex h-5 w-12 shrink-0 items-center justify-end text-right text-[11px] leading-none font-medium',
          STATUS_CLASS[call.status],
        )}
      >
        {STATUS_LABEL[call.status]}
      </span>
      {isActive && onAbort ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onAbort}
          className="h-5 px-1.5 text-[11px] text-destructive hover:text-destructive"
          title="Stop running tool"
        >
          <SquareIcon className="size-2.5" />
          Stop
        </Button>
      ) : null}
      {children}
    </div>
  );
}

function getToolSummary(call: ToolCallDisplayItem, displayName: string) {
  const kind = getToolKind(call.toolName);
  const label = getToolLabel(call.toolName, displayName, kind);
  const preview = getToolPreview(call, kind);
  const meta = getToolMeta(call);
  const connectorIconSlug = getConnectorIconSlug(call.toolName);
  const mcpServerId = parseMcpToolName(call.toolName)?.serverId ?? null;

  return { kind, label, preview, meta, connectorIconSlug, mcpServerId };
}

function getToolKind(toolName: string): ToolSummaryKind {
  if (parseMcpToolName(toolName)) return 'mcp';
  return getToolIconKind(toolName);
}

function getToolLabel(toolName: string, displayName: string, kind: ToolSummaryKind): string {
  if (toolName === 'gmail_download_attachments') return 'Gmail Attachments';

  if (kind === 'mcp') {
    const parsed = parseMcpToolName(toolName);
    return parsed ? formatToolDisplayName(parsed.toolName) : displayName;
  }

  if (toolName === 'execute_typescript') return 'Code';
  return displayName;
}

function getConnectorIconSlug(toolName: string): string | null {
  const service = toolName.split('_', 1)[0];
  if (!service) return null;
  return GOOGLE_SERVICE_ICON_SLUGS[service as keyof typeof GOOGLE_SERVICE_ICON_SLUGS] ?? null;
}

function getToolPreview(call: ToolCallDisplayItem, kind: ToolSummaryKind): string {
  if (call.error) return truncateText(call.error, 96);

  const toolsetPreview = getToolsetPreview(call);
  if (toolsetPreview) return toolsetPreview;

  const gmailPreview = getGmailPreview(call);
  if (gmailPreview) return gmailPreview;

  const skillPreview = getSkillPreview(call);
  if (skillPreview) return skillPreview;

  switch (kind) {
    case 'bash':
      return getStringArg(call.args, ['description', 'command', 'code']) ?? 'Running command';
    case 'read':
      return getStringArg(call.args, ['filePath', 'path']) ?? 'Waiting for path';
    case 'edit':
      return getStringArg(call.args, ['filePath', 'path']) ?? 'Editing file';
    case 'write':
      return getStringArg(call.args, ['filePath', 'path']) ?? 'Writing file';
    case 'search':
      return getStringArg(call.args, ['query', 'pattern', 'q']) ?? 'Searching';
    case 'web':
      return getStringArg(call.args, ['url', 'target', 'action']) ?? 'Using browser';
    case 'task':
      return getStringArg(call.args, ['description', 'prompt', 'command']) ?? 'Running subagent';
    case 'question':
      return getStringArg(call.args, ['question', 'header']) ?? 'Waiting for response';
    case 'skill':
      return 'Loading skill';
    case 'memory':
      return getStringArg(call.args, ['action', 'content']) ?? 'Using memory';
    case 'todo':
      return getStringArg(call.args, ['action']) ?? 'Updating todos';
    case 'agenda':
      return getBestGenericPreview(call.args, call.result) ?? 'Using agenda';
    case 'browser':
      return getStringArg(call.args, ['url', 'action', 'ref']) ?? 'Using browser';
    case 'recordings':
      return getBestGenericPreview(call.args, call.result) ?? 'Using recordings';
    case 'session-history':
      return getBestGenericPreview(call.args, call.result) ?? 'Searching sessions';
    case 'inspect-image':
      return getStringArg(call.args, ['prompt', 'imagePath']) ?? 'Inspecting image';
    case 'mcp':
    case 'generic':
      return getBestGenericPreview(call.args, call.result) ?? 'Using tool';
  }
}

function getSkillPreview(call: ToolCallDisplayItem): string | null {
  if (call.toolName !== 'skill') return null;

  if (call.status === 'pending' || call.status === 'in-progress') {
    return 'Loading skill';
  }

  return 'Reading skill';
}

function getToolsetPreview(call: ToolCallDisplayItem): string | null {
  if (!isToolsetTool(call.toolName)) return null;

  const toolsetName =
    getStringArg(call.result, ['toolsetName', 'name']) ?? getStringArg(call.args, ['toolsetId']);
  const normalizedName = toolsetName ?? 'toolset';

  if (call.toolName === 'list_toolsets') {
    const toolsets = getArrayLength(call.result, 'toolsets');
    if (toolsets !== null) return `${toolsets} available toolsets`;

    const query = getStringArg(call.args, ['query']);
    return query ? `Find toolsets matching ${query}` : 'Review available toolsets';
  }

  if (call.toolName === 'activate_toolset') {
    if (call.status === 'pending' || call.status === 'in-progress') {
      return `Activating ${normalizedName}`;
    }

    const tools = getArrayLength(call.result, 'tools');
    const suffix = tools !== null ? ` with ${tools} tools` : '';
    return `Activated ${normalizedName}${suffix}`;
  }

  if (call.toolName === 'deactivate_toolset') {
    if (call.status === 'pending' || call.status === 'in-progress') {
      return `Deactivating ${normalizedName}`;
    }
    return `Removed ${normalizedName} tools`;
  }

  return null;
}

function getGmailPreview(call: ToolCallDisplayItem): string | null {
  if (call.toolName === 'gmail_download_attachments') {
    const attachments = getArrayLength(call.result, 'attachments');
    if (attachments !== null) {
      return attachments === 0
        ? 'No attachments found'
        : `Downloaded ${attachments} attachment${attachments === 1 ? '' : 's'}`;
    }

    const messageId = getStringArg(call.args, ['messageId']);
    return messageId ? `Download attachments from message ${messageId}` : 'Download attachments';
  }

  if (call.toolName === 'gmail_read') {
    const subject = getStringArg(call.result, ['subject']);
    if (subject) return subject;

    const messageId = getStringArg(call.args, ['messageId']);
    return messageId ? `Read message ${messageId}` : 'Read message';
  }

  return null;
}

function isToolsetTool(toolName: string): boolean {
  return (
    toolName === 'list_toolsets' ||
    toolName === 'activate_toolset' ||
    toolName === 'deactivate_toolset'
  );
}

function getArrayLength(value: unknown, key: string): number | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as Record<string, unknown>)[key];
  return Array.isArray(raw) ? raw.length : null;
}

function getToolMeta(call: ToolCallDisplayItem): string | undefined {
  if (call.status === 'error') return undefined;

  if (call.toolName === 'skill') {
    return getStringArg(call.args, ['name', 'skill']) ?? undefined;
  }

  const exitCode = (call.result as { metadata?: { exit?: unknown } } | undefined)?.metadata?.exit;
  if (typeof exitCode === 'number' && exitCode !== 0) return `exit ${exitCode}`;

  const usedAccount =
    getStringArg(call.args, ['account']) ?? getStringArg(call.result, ['usedAccount', 'account']);
  return usedAccount ?? undefined;
}

function getBestGenericPreview(args: unknown, result: unknown): string | null {
  return (
    getStringArg(args, ['description', 'query', 'title', 'name', 'id']) ??
    getStringArg(result, ['title', 'name', 'id'])
  );
}

function getStringArg(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === 'string' && raw.trim().length > 0) return truncateText(raw.trim(), 120);
  }

  return null;
}

function ToolStatusIcon({
  status,
  kind,
  connectorIconSlug,
  mcpServerId,
  label,
}: {
  status: ToolCallStatus;
  kind: ToolSummaryKind;
  connectorIconSlug: string | null;
  mcpServerId: string | null;
  label: string;
}) {
  if (status === 'pending') {
    return <ClockIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }

  if (status === 'in-progress') {
    return <LoaderIcon className="size-3.5 shrink-0 animate-spin text-info" />;
  }

  if (connectorIconSlug) {
    return (
      <ConnectorIcon
        icon={{ type: 'simpleIcons', slug: connectorIconSlug }}
        className="size-3.5 shrink-0 bg-success"
      />
    );
  }

  if (mcpServerId) {
    return <McpServerLogo serverId={mcpServerId} name={label} className="size-3.5" />;
  }

  return <ToolKindIcon kind={kind} className="size-3.5 shrink-0 text-success" />;
}

function usePrevious(value: number) {
  const ref = React.useRef<number>(undefined);

  React.useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}
