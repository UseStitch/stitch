import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  FilePenIcon,
  FileTextIcon,
  GlobeIcon,
  HelpCircleIcon,
  LoaderIcon,
  SearchIcon,
  SquareIcon,
  TerminalIcon,
  WrenchIcon,
} from 'lucide-react';
import * as React from 'react';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';
import { parseMcpToolName } from '@stitch/shared/mcp/types';

import { formatToolDisplayName, truncateText, useStitchToolDisplayName } from './tool-call/card-primitives';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const VISIBLE_TOOL_COUNT = 4;

type ToolSummaryKind =
  | 'bash'
  | 'file'
  | 'search'
  | 'web'
  | 'task'
  | 'question'
  | 'skill'
  | 'mcp'
  | 'generic';

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

const SEARCH_TOOLS = new Set(['gmail_search', 'drive_search', 'grep', 'glob']);
const FILE_TOOLS = new Set(['read', 'write', 'edit']);

export function ToolCallGroup({ calls, onAbort }: ToolCallGroupProps) {
  const [expanded, setExpanded] = React.useState(false);
  const hiddenCount = Math.max(0, calls.length - VISIBLE_TOOL_COUNT);
  const visibleCalls = expanded ? calls : calls.slice(hiddenCount);
  const previousHiddenCount = usePrevious(hiddenCount);
  const hiddenCountIncreased = previousHiddenCount !== undefined && hiddenCount > previousHiddenCount;

  if (calls.length === 0) return null;

  return (
    <div className="my-1.5 space-y-0.5 text-xs">
      {hiddenCount > 0 ? (
        <Button
          key={hiddenCount}
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setExpanded((current) => !current)}
          className={cn(
            'h-6 w-full justify-start px-1.5 text-muted-foreground hover:bg-muted/60',
            hiddenCountIncreased && 'animate-in fade-in slide-in-from-top-1 duration-200',
          )}
        >
          <ChevronDownIcon className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
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

function ToolCallRow({
  call,
  onAbort,
  animateIn,
}: {
  call: ToolCallDisplayItem;
  onAbort?: () => void;
  animateIn: boolean;
}) {
  const displayName = useStitchToolDisplayName(call.toolName);
  const summary = getToolSummary(call, displayName);
  const isActive = call.status === 'pending' || call.status === 'in-progress';

  return (
    <div
      className={cn(
        'group flex min-h-7 min-w-0 items-center gap-2 rounded-md px-1.5 text-xs transition-colors hover:bg-muted/50',
        animateIn && isActive && 'animate-in fade-in slide-in-from-top-1 duration-200',
      )}
    >
      <ToolStatusIcon status={call.status} kind={summary.kind} />
      <span className="shrink-0 font-medium text-foreground">{summary.label}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary.preview}</span>
      {summary.meta ? (
        <span className="hidden shrink-0 text-muted-foreground/80 sm:inline">{summary.meta}</span>
      ) : null}
      <span className={cn('shrink-0 text-[11px] font-medium', STATUS_CLASS[call.status])}>
        {STATUS_LABEL[call.status]}
      </span>
      {isActive && onAbort ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onAbort}
          className="h-5 px-1.5 text-[11px] text-muted-foreground"
          title="Stop running tool"
        >
          <SquareIcon className="size-2.5" />
          Stop
        </Button>
      ) : null}
    </div>
  );
}

function getToolSummary(call: ToolCallDisplayItem, displayName: string) {
  const kind = getToolKind(call.toolName);
  const label = getToolLabel(call.toolName, displayName, kind);
  const preview = getToolPreview(call, kind);
  const meta = getToolMeta(call);

  return { kind, label, preview, meta };
}

function getToolKind(toolName: string): ToolSummaryKind {
  if (toolName === 'bash' || toolName === 'execute_typescript') return 'bash';
  if (FILE_TOOLS.has(toolName)) return 'file';
  if (SEARCH_TOOLS.has(toolName)) return 'search';
  if (toolName === 'webfetch' || toolName.startsWith('browser_')) return 'web';
  if (toolName === 'task') return 'task';
  if (toolName === 'question') return 'question';
  if (toolName === 'skill') return 'skill';
  if (parseMcpToolName(toolName)) return 'mcp';
  return 'generic';
}

function getToolLabel(toolName: string, displayName: string, kind: ToolSummaryKind): string {
  if (kind === 'mcp') {
    const parsed = parseMcpToolName(toolName);
    return parsed ? formatToolDisplayName(parsed.toolName) : displayName;
  }

  if (toolName === 'execute_typescript') return 'Code';
  return displayName;
}

function getToolPreview(call: ToolCallDisplayItem, kind: ToolSummaryKind): string {
  if (call.error) return truncateText(call.error, 96);

  switch (kind) {
    case 'bash':
      return getStringArg(call.args, ['description', 'command', 'code']) ?? 'Running command';
    case 'file':
      return getStringArg(call.args, ['filePath', 'path']) ?? 'Waiting for path';
    case 'search':
      return getStringArg(call.args, ['query', 'pattern', 'q']) ?? 'Searching';
    case 'web':
      return getStringArg(call.args, ['url', 'target', 'action']) ?? 'Using browser';
    case 'task':
      return getStringArg(call.args, ['description', 'prompt', 'command']) ?? 'Running subagent';
    case 'question':
      return getStringArg(call.args, ['question', 'header']) ?? 'Waiting for response';
    case 'skill':
      return getStringArg(call.args, ['name', 'skill']) ?? 'Loading skill';
    case 'mcp':
    case 'generic':
      return getBestGenericPreview(call.args, call.result) ?? 'Using tool';
  }
}

function getToolMeta(call: ToolCallDisplayItem): string | undefined {
  if (call.status === 'error') return undefined;

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

function ToolStatusIcon({ status, kind }: { status: ToolCallStatus; kind: ToolSummaryKind }) {
  if (status === 'pending') {
    return <ClockIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }

  if (status === 'in-progress') {
    return <LoaderIcon className="size-3.5 shrink-0 animate-spin text-info" />;
  }

  if (status === 'error') {
    return <AlertCircleIcon className="size-3.5 shrink-0 text-destructive" />;
  }

  return <ToolKindIcon kind={kind} className="size-3.5 shrink-0 text-success" />;
}

function ToolKindIcon({ kind, className }: { kind: ToolSummaryKind; className?: string }) {
  switch (kind) {
    case 'bash':
      return <TerminalIcon className={className} />;
    case 'file':
      return <FileTextIcon className={className} />;
    case 'search':
      return <SearchIcon className={className} />;
    case 'web':
      return <GlobeIcon className={className} />;
    case 'task':
      return <WrenchIcon className={className} />;
    case 'question':
      return <HelpCircleIcon className={className} />;
    case 'skill':
      return <CheckIcon className={className} />;
    case 'mcp':
      return <WrenchIcon className={className} />;
    case 'generic':
      return <FilePenIcon className={className} />;
  }
}

function usePrevious(value: number) {
  const ref = React.useRef<number>(undefined);

  React.useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}
