import { AlertCircleIcon, CheckIcon, CopyIcon, LoaderIcon, SquareIcon } from 'lucide-react';
import * as React from 'react';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ToolCardState = {
  hasError: boolean;
  hasSuccess: boolean;
  isActive: boolean;
};

export function getToolCardState(status: ToolCallStatus): ToolCardState {
  return {
    hasError: status === 'error',
    hasSuccess: status === 'completed',
    isActive: status === 'pending' || status === 'in-progress',
  };
}

export function getToolLabel(status: ToolCallStatus, error?: string): string | undefined {
  if (status !== 'error') return undefined;
  if (!error) return undefined;
  return error.includes('User rejected tool execution') ? 'Blocked by user' : error;
}

export function truncateText(value: string, max = 84): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}...`;
}

export function formatToolDisplayName(toolName: string): string {
  const normalized = toolName.replace(/[_-]+/g, ' ').trim();
  if (!normalized) return toolName;
  return normalized.replace(/\b\w/g, (match) => match.toUpperCase());
}

function toolCallBorderClass({ hasError, isActive, hasSuccess }: ToolCardState) {
  if (hasError) return 'border-destructive/35 bg-destructive/5';
  if (hasSuccess) return 'border-success/35 bg-success/5';
  if (isActive) return 'border-info/35 bg-info/8';
  return 'border-border/50 bg-muted/20';
}

function StatusIcon({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-info/35 border-t-info" />
      );
    case 'in-progress':
      return <LoaderIcon className="size-3.5 shrink-0 animate-spin text-info" />;
    case 'completed':
      return <CheckIcon className="size-3.5 shrink-0 text-success" />;
    case 'error':
      return <AlertCircleIcon className="size-3.5 shrink-0 text-destructive" />;
  }
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
  const state = getToolCardState(status);

  return (
    <div
      className={cn(
        'my-2 w-full overflow-hidden rounded-lg border text-xs shadow-sm transition-colors',
        toolCallBorderClass(state),
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
        'flex w-full items-center gap-2.5 px-3 py-2.5',
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
  return (
    <span className={cn('text-sm leading-tight font-medium capitalize', className)}>
      {children}
    </span>
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

export const ToolCard = {
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
