import {
  ChevronRightIcon,
  CheckIcon,
  CopyIcon,
  AlertCircleIcon,
  LoaderIcon,
  SquareIcon,
} from 'lucide-react';
import * as React from 'react';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

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
        <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-info/35 border-t-info animate-spin" />
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
        'my-2 w-full overflow-hidden rounded-lg border text-xs shadow-sm transition-colors',
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
        'flex w-full items-start gap-2.5 px-3 py-2.5',
        tone === 'accent' && 'bg-primary/5',
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
  return <span className={cn('text-sm leading-tight font-medium capitalize', className)}>{children}</span>;
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
        mono && 'font-mono text-xs',
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
  return <span className={cn('inline-flex items-center gap-1.5', className)}>{children}</span>;
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

function ToolCardStopButton({ onAbort }: { onAbort: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={onAbort}
      className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
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
  if (hasError) return 'border-destructive/35 bg-destructive/5';
  if (hasSuccess) return 'border-success/35 bg-success/5';
  if (isActive) return 'border-info/35 bg-info/8';
  return 'border-border/50 bg-muted/20';
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
      <ToolCard.Header>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center justify-start gap-2 text-left text-foreground"
        >
          <ToolCard.StatusIndicator status={status} />
          <ToolCard.Title className="min-w-0 flex-1 truncate">{toolName}</ToolCard.Title>
          <ChevronRightIcon
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
        </button>
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
        <div className="min-w-0 flex-1 space-y-1">
          <ToolCard.Title>{toolName}</ToolCard.Title>
          {label ? <ToolCard.TitleContent truncate className="block">{label}</ToolCard.TitleContent> : null}
        </div>
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
        <div className="min-w-0 flex-1 space-y-1">
          <ToolCard.Title>{toolName}</ToolCard.Title>
          <ToolCard.TitleContent truncate mono className="block">
            {label ? `${displayUrl} - ${label}` : displayUrl}
          </ToolCard.TitleContent>
        </div>
        {isActive && onAbort ? (
          <ToolCard.Actions className="self-center">
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

function getBashArgs(args: unknown): {
  action: string | null;
  command: string | null;
} {
  const rawAction = (args as { description?: unknown })?.description;
  const rawCommand = (args as { command?: unknown })?.command;

  const action =
    typeof rawAction === 'string' && rawAction.trim().length > 0 ? rawAction.trim() : null;
  const command =
    typeof rawCommand === 'string' && rawCommand.trim().length > 0 ? rawCommand.trim() : null;

  return {
    action,
    command,
  };
}

function BashToolBlock({
  toolName,
  status,
  args,
  onAbort,
}: {
  toolName: string;
  status: ToolCallStatus;
  args: unknown;
  onAbort?: () => void;
}) {
  const { isActive } = getToolCardState(status);
  const { action, command } = getBashArgs(args);
  const [open, setOpen] = React.useState(false);
  const [showFullCommand, setShowFullCommand] = React.useState(false);
  const actionLabel = action ?? 'Run a shell command';
  const commandPreview = command ? truncateText(command, 180) : 'Waiting for command...';
  const canExpandCommand = Boolean(command && command.length > 180);

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center justify-start gap-2 text-left text-foreground"
        >
          <ToolCard.StatusIndicator status={status} />
          <span className="min-w-0 flex-1 text-left">
            <ToolCard.Title>{toolName}</ToolCard.Title>
            <ToolCard.TitleContent truncate className="mt-1 block">
              {actionLabel}
            </ToolCard.TitleContent>
          </span>
          <ChevronRightIcon
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
        </button>
        <ToolCard.Actions className="self-center">
          {isActive && onAbort ? <ToolCard.StopButton onAbort={onAbort} /> : null}
        </ToolCard.Actions>
      </ToolCard.Header>

      <ToolCard.Content open={open}>
        <div className="space-y-1.5">
          <div className="font-medium text-foreground">Command</div>
          <div className="font-mono text-xs text-muted-foreground break-all whitespace-pre-wrap">
            {showFullCommand ? (command ?? commandPreview) : commandPreview}
          </div>
          {canExpandCommand ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setShowFullCommand((current) => !current)}
              className="h-6 px-2 text-xs"
            >
              {showFullCommand ? 'Show less' : 'Show full command'}
            </Button>
          ) : null}
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
        <div className="min-w-0 flex-1 space-y-1">
          <ToolCard.Title>{toolName}</ToolCard.Title>
          <ToolCard.TitleContent truncate mono className="block">
            {label ? `${displayPath} - ${label}` : displayPath}
          </ToolCard.TitleContent>
        </div>
        {filePath ? (
          <ToolCard.Actions className="self-center">
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
