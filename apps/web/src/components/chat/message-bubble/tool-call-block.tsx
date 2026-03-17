import {
  ChevronRightIcon,
  CheckIcon,
  CopyIcon,
  AlertCircleIcon,
  LoaderIcon,
  SquareIcon,
} from 'lucide-react';
import * as React from 'react';

import type { ToolCallStatus } from '@openwork/shared';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ToolCardState = {
  hasError: boolean;
  hasSuccess: boolean;
  isActive: boolean;
};

function getToolCardState(status: ToolCallStatus): ToolCardState {
  return {
    hasError: status === 'error',
    hasSuccess: status === 'completed',
    isActive: status === 'pending' || status === 'in-progress',
  };
}

function StatusIcon({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'pending':
      return (
        <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground animate-spin" />
      );
    case 'in-progress':
      return <LoaderIcon className="mt-0.5 size-3.5 shrink-0 text-info animate-spin" />;
    case 'completed':
      return <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />;
    case 'error':
      return <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
  }
}

function getToolLabel(status: ToolCallStatus, error?: string): string | undefined {
  if (status !== 'error') return undefined;
  if (!error) return undefined;
  return error.includes('User rejected tool execution') ? 'Blocked by user' : error;
}

function ToolCardRoot({
  status,
  children,
  className,
}: {
  status: ToolCallStatus;
  children: React.ReactNode;
  className?: string;
}) {
  const { hasError, hasSuccess, isActive } = getToolCardState(status);

  return (
    <div
      className={cn(
        'my-2 w-full overflow-hidden rounded-lg border text-xs transition-colors',
        toolCallBorderClass({ hasError, isActive, hasSuccess }),
        className,
      )}
    >
      {children}
    </div>
  );
}

function ToolCardHeader({
  children,
  tone = 'plain',
  className,
}: {
  children: React.ReactNode;
  tone?: 'plain' | 'accent';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2',
        tone === 'accent' && 'bg-primary/5 text-primary',
        className,
      )}
    >
      {children}
    </div>
  );
}

function ToolCardStatusIndicator({
  status,
  className,
}: {
  status: ToolCallStatus;
  className?: string;
}) {
  return (
    <span className={className}>
      <StatusIcon status={status} />
    </span>
  );
}

function ToolCardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('text-sm leading-none font-medium capitalize', className)}>{children}</span>
  );
}

function ToolCardTitleContent({
  children,
  truncate,
  mono,
  className,
}: {
  children: React.ReactNode;
  truncate?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-xs text-muted-foreground',
        truncate && 'min-w-0 flex-1 truncate',
        mono && 'font-mono text-[11px]',
        className,
      )}
    >
      {children}
    </span>
  );
}

function ToolCardActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn('inline-flex items-center gap-1', className)}>{children}</span>;
}

function ToolCardCopyButton({
  value,
  copyLabel = 'Copy file path',
  copiedLabel = 'Copied',
  className,
}: {
  value: string;
  copyLabel?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timeoutId = setTimeout(() => setCopied(false), 1000);
    return () => clearTimeout(timeoutId);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-xs"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
      className={cn('text-muted-foreground hover:text-foreground', className)}
      title={copied ? copiedLabel : copyLabel}
      aria-label={copied ? copiedLabel : copyLabel}
    >
      <span className="relative inline-flex size-3">
        <CopyIcon
          className={cn(
            'absolute inset-0 size-3 transition-all duration-200',
            copied ? 'scale-75 opacity-0' : 'scale-100 opacity-100',
          )}
        />
        <CheckIcon
          className={cn(
            'text-success absolute inset-0 size-3 transition-all duration-200',
            copied ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
          )}
        />
      </span>
    </Button>
  );
}

function ToolCardExpandToggle({
  open,
  onOpenChange,
  className,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={() => onOpenChange(!open)}
      className={cn('text-primary hover:text-primary/90', className)}
      aria-label={open ? 'Collapse' : 'Expand'}
      title={open ? 'Collapse' : 'Expand'}
    >
      <ChevronRightIcon
        className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')}
      />
    </Button>
  );
}

function ToolCardStopButton({ onAbort }: { onAbort: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={onAbort}
      className="h-auto gap-1 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
      title="Stop running tool"
    >
      <SquareIcon className="size-3" />
      Stop
    </Button>
  );
}

function ToolCardContent({
  children,
  open,
  className,
}: {
  children: React.ReactNode;
  open?: boolean;
  className?: string;
}) {
  if (open === false) return null;
  return (
    <div className={cn('border-t border-border/40 px-3 py-2 text-xs', className)}>{children}</div>
  );
}

const ToolCard = {
  Root: ToolCardRoot,
  Header: ToolCardHeader,
  StatusIndicator: ToolCardStatusIndicator,
  Title: ToolCardTitle,
  TitleContent: ToolCardTitleContent,
  Actions: ToolCardActions,
  CopyButton: ToolCardCopyButton,
  ExpandToggle: ToolCardExpandToggle,
  StopButton: ToolCardStopButton,
  Content: ToolCardContent,
};

function QuestionAnswers({ args, result }: { args: unknown; result?: unknown }) {
  const questions = (args as { questions?: { question: string; header: string }[] })?.questions;
  const answers = (result as { answers?: (string[] | undefined)[] } | undefined)?.answers;

  if (!questions) return null;

  return (
    <div className="space-y-2">
      {questions.map((q, i) => {
        const answer = answers?.[i];
        const hasAnswer = answer !== undefined && answer.length > 0;
        return (
          <div key={q.header} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{q.question}</span>
            {hasAnswer ? (
              <span className="text-sm leading-relaxed font-medium text-foreground">
                {answer.join(', ')}
              </span>
            ) : (
              <span className="text-xs italic text-muted-foreground/70">Waiting for answer...</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

type ToolCallBlockClasses = {
  hasError: boolean;
  isActive: boolean;
  hasSuccess: boolean;
};

function toolCallBorderClass({ hasError, isActive, hasSuccess }: ToolCallBlockClasses) {
  if (hasError) return 'border-destructive/40 bg-destructive/5';
  if (hasSuccess) return 'border-success/40 bg-success/5';
  if (isActive) return 'border-info/30 bg-info/10';
  return 'border-border/40 bg-muted/25';
}

function QuestionToolBlock({
  toolName,
  status,
  args,
  result,
}: {
  toolName: string;
  status: ToolCallStatus;
  args: unknown;
  result?: unknown;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header tone="accent" className="hover:bg-primary/10">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen((current) => !current)}
          className="h-auto min-w-0 flex-1 justify-start gap-2 px-0 py-0 text-left text-primary hover:bg-transparent hover:text-primary/90"
        >
          <ToolCard.StatusIndicator status={status} />
          <ToolCard.Title>{toolName}</ToolCard.Title>
        </Button>
        <ToolCard.Actions className="ml-auto">
          <ToolCard.ExpandToggle open={open} onOpenChange={setOpen} />
        </ToolCard.Actions>
      </ToolCard.Header>
      <ToolCard.Content open={open}>
        <QuestionAnswers args={args} result={result} />
      </ToolCard.Content>
    </ToolCard.Root>
  );
}

function GenericToolBlock({
  toolName,
  status,
  error,
}: {
  toolName: string;
  status: ToolCallStatus;
  error?: string;
}) {
  const label = getToolLabel(status, error);

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <ToolCard.StatusIndicator status={status} />
        <ToolCard.Title>{toolName}</ToolCard.Title>
        {label ? <ToolCard.TitleContent truncate>- {label}</ToolCard.TitleContent> : null}
      </ToolCard.Header>
    </ToolCard.Root>
  );
}

function getWebfetchUrl(args: unknown): string | null {
  const value = (args as { url?: unknown })?.url;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function truncateText(value: string, max = 84): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}...`;
}

function WebfetchToolBlock({
  toolName,
  status,
  args,
  error,
  onAbort,
}: {
  toolName: string;
  status: ToolCallStatus;
  args: unknown;
  error?: string;
  onAbort?: () => void;
}) {
  const { isActive } = getToolCardState(status);
  const label = getToolLabel(status, error);
  const url = getWebfetchUrl(args);
  const displayUrl = url ? truncateText(url) : 'Waiting for URL...';

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <ToolCard.StatusIndicator status={status} />
        <ToolCard.Title>{toolName}</ToolCard.Title>
        <ToolCard.TitleContent truncate mono>
          {label ? `${displayUrl} - ${label}` : displayUrl}
        </ToolCard.TitleContent>
        {isActive && onAbort ? (
          <ToolCard.Actions>
            <ToolCard.StopButton onAbort={onAbort} />
          </ToolCard.Actions>
        ) : null}
      </ToolCard.Header>
    </ToolCard.Root>
  );
}

function getFilePathFromArgs(args: unknown): string | null {
  const value = (args as { filePath?: unknown })?.filePath;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatTimeoutLabel(timeoutMs: number | null): string {
  const fallbackMs = 120000;
  const value = timeoutMs ?? fallbackMs;
  if (!Number.isFinite(value) || value <= 0) return '2 min';

  const totalSeconds = Math.round(value / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function getBashArgs(args: unknown): {
  action: string | null;
  command: string | null;
  timeoutMs: number | null;
} {
  const rawAction = (args as { description?: unknown })?.description;
  const rawCommand = (args as { command?: unknown })?.command;
  const rawTimeout = (args as { timeout?: unknown })?.timeout;

  const action =
    typeof rawAction === 'string' && rawAction.trim().length > 0 ? rawAction.trim() : null;
  const command =
    typeof rawCommand === 'string' && rawCommand.trim().length > 0 ? rawCommand.trim() : null;
  const timeoutMs =
    typeof rawTimeout === 'number' && Number.isFinite(rawTimeout) && rawTimeout > 0
      ? Math.trunc(rawTimeout)
      : null;

  return {
    action,
    command,
    timeoutMs,
  };
}

function getBashResultSummary(status: ToolCallStatus, result: unknown, error?: string): string {
  if (status === 'pending' || status === 'in-progress') return 'Running';
  if (status === 'error') return error ? `Failed: ${error}` : 'Failed';

  const exitCode = (result as { metadata?: { exit?: unknown } } | null)?.metadata?.exit;
  if (typeof exitCode === 'number') {
    return exitCode === 0 ? 'Done' : `Completed with issues (exit ${exitCode})`;
  }

  return 'Done';
}

function getBashOutputText(result: unknown): string | null {
  const direct = (result as { output?: unknown } | null)?.output;
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct.trim();
  }

  if (typeof result === 'string' && result.trim().length > 0) {
    return result.trim();
  }

  return null;
}

function BashToolBlock({
  toolName,
  status,
  args,
  result,
  error,
  onAbort,
}: {
  toolName: string;
  status: ToolCallStatus;
  args: unknown;
  result?: unknown;
  error?: string;
  onAbort?: () => void;
}) {
  const { isActive } = getToolCardState(status);
  const label = getToolLabel(status, error);
  const { action, command, timeoutMs } = getBashArgs(args);
  const [open, setOpen] = React.useState(false);
  const outputText = getBashOutputText(result);
  const resultSummary = getBashResultSummary(status, result, label);
  const timeoutLabel = formatTimeoutLabel(timeoutMs);
  const actionLabel = action ?? 'Run a shell command';
  const commandPreview = command ? truncateText(command, 96) : 'Waiting for command...';
  const outputPreview = outputText
    ? truncateText(outputText.replace(/\s+/g, ' '), 180)
    : 'No output yet';

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header tone="accent">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen((current) => !current)}
          className="h-auto min-w-0 flex-1 justify-start gap-2 px-0 py-0 text-primary hover:bg-transparent hover:text-primary/90"
        >
          <ToolCard.StatusIndicator status={status} />
          <span className="min-w-0 flex-1 truncate text-left text-sm leading-none font-medium">
            <span className="capitalize">{toolName}</span>
            <span className="text-primary/70"> / {actionLabel}</span>
          </span>
        </Button>
        <ToolCard.Actions>
          <ToolCard.ExpandToggle open={open} onOpenChange={setOpen} />
          {isActive && onAbort ? <ToolCard.StopButton onAbort={onAbort} /> : null}
        </ToolCard.Actions>
      </ToolCard.Header>

      <ToolCard.Content open={open}>
        <div className="space-y-1.5">
          <div className="font-mono text-[11px] text-muted-foreground break-all">
            <span className="font-sans font-medium text-foreground">Command:</span> {commandPreview}
          </div>
          <div className="text-muted-foreground">
            <span className="font-medium text-foreground">Result:</span> {resultSummary}
          </div>
          <div className="text-muted-foreground">
            <span className="font-medium text-foreground">Output:</span> {outputPreview}
          </div>
          <div className="text-muted-foreground">
            <span className="font-medium text-foreground">Time limit:</span> {timeoutLabel}
          </div>
        </div>
      </ToolCard.Content>
    </ToolCard.Root>
  );
}

function FileToolBlock({
  toolName,
  status,
  args,
  error,
}: {
  toolName: string;
  status: ToolCallStatus;
  args: unknown;
  error?: string;
}) {
  const label = getToolLabel(status, error);
  const filePath = getFilePathFromArgs(args);
  const displayPath = filePath ? truncateText(filePath) : 'Waiting for path...';

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <ToolCard.StatusIndicator status={status} />
        <ToolCard.Title>{toolName}</ToolCard.Title>
        <ToolCard.TitleContent truncate mono>
          {label ? `${displayPath} - ${label}` : displayPath}
        </ToolCard.TitleContent>
        {filePath ? (
          <ToolCard.Actions>
            <ToolCard.CopyButton value={filePath} />
          </ToolCard.Actions>
        ) : null}
      </ToolCard.Header>
    </ToolCard.Root>
  );
}

type ToolCallBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args?: unknown;
  result?: unknown;
  error?: string;
  onAbort?: () => void;
};

export function ToolCallBlock({
  toolName,
  status,
  args,
  result,
  error,
  onAbort,
}: ToolCallBlockProps) {
  const isQuestion = toolName === 'question' && args !== undefined && args !== null;
  const isWebfetch = toolName === 'webfetch' && args !== undefined && args !== null;
  const isBash = toolName === 'bash' && args !== undefined && args !== null;
  const isWrite = toolName === 'write' && args !== undefined && args !== null;
  const isEdit = toolName === 'edit' && args !== undefined && args !== null;
  const isRead = toolName === 'read' && args !== undefined && args !== null;

  if (isQuestion) {
    return <QuestionToolBlock toolName={toolName} status={status} args={args} result={result} />;
  }

  if (isWebfetch) {
    return (
      <WebfetchToolBlock
        toolName={toolName}
        status={status}
        args={args}
        error={error}
        onAbort={onAbort}
      />
    );
  }

  if (isBash) {
    return (
      <BashToolBlock
        toolName={toolName}
        status={status}
        args={args}
        result={result}
        error={error}
        onAbort={onAbort}
      />
    );
  }

  if (isWrite) {
    return <FileToolBlock toolName={toolName} status={status} args={args} error={error} />;
  }

  if (isEdit) {
    return <FileToolBlock toolName={toolName} status={status} args={args} error={error} />;
  }

  if (isRead) {
    return <FileToolBlock toolName={toolName} status={status} args={args} error={error} />;
  }

  return <GenericToolBlock toolName={toolName} status={status} error={error} />;
}
