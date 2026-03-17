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

import { cn } from '@/lib/utils';

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
              <span className="text-sm leading-relaxed font-medium text-foreground">{answer.join(', ')}</span>
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
  const hasError = status === 'error';
  const hasSuccess = status === 'completed';
  const isActive = status === 'pending' || status === 'in-progress';

  return (
    <div
      className={cn(
        'my-2 w-full overflow-hidden rounded-lg border text-xs transition-colors',
        toolCallBorderClass({ hasError, isActive, hasSuccess }),
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 bg-primary/5 px-3 py-2 text-primary transition-colors hover:bg-primary/10"
      >
        <StatusIcon status={status} />
        <span className="text-sm leading-none font-medium capitalize">{toolName}</span>
        <ChevronRightIcon
          className={cn('ml-auto size-3 shrink-0 text-primary transition-transform', open && 'rotate-90')}
        />
      </button>
      {open && (
        <div className="border-t border-border/40 px-3 py-2 text-xs">
          <QuestionAnswers args={args} result={result} />
        </div>
      )}
    </div>
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
  const hasError = status === 'error';
  const hasSuccess = status === 'completed';
  const isActive = status === 'pending' || status === 'in-progress';
  const isBlocked = hasError && (error?.includes('User rejected tool execution') ?? false);
  const label = isBlocked ? 'Blocked by user' : error;

  return (
    <div
      className={cn(
        'my-2 w-full overflow-hidden rounded-lg border text-xs transition-colors',
        toolCallBorderClass({ hasError, isActive, hasSuccess }),
      )}
    >
      <div className="inline-flex w-full items-center gap-2 px-3 py-2">
        <StatusIcon status={status} />
        <span className="text-sm leading-none font-medium capitalize">{toolName}</span>
        {label ? (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">- {label}</span>
        ) : null}
      </div>
    </div>
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
  const hasError = status === 'error';
  const hasSuccess = status === 'completed';
  const isActive = status === 'pending' || status === 'in-progress';
  const isBlocked = hasError && (error?.includes('User rejected tool execution') ?? false);
  const label = isBlocked ? 'Blocked by user' : error;
  const url = getWebfetchUrl(args);
  const displayUrl = url ? truncateText(url) : 'Waiting for URL...';

  return (
    <div
      className={cn(
        'my-2 w-full overflow-hidden rounded-lg border text-xs transition-colors',
        toolCallBorderClass({ hasError, isActive, hasSuccess }),
      )}
    >
      <div className="inline-flex w-full items-center gap-2 px-3 py-2">
        <StatusIcon status={status} />
        <span className="text-sm leading-none font-medium capitalize">{toolName}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {label ? `${displayUrl} - ${label}` : displayUrl}
        </span>
        {isActive && onAbort ? (
          <button
            type="button"
            onClick={onAbort}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            title="Stop running tool"
          >
            <SquareIcon className="size-3" />
            Stop
          </button>
        ) : null}
      </div>
    </div>
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

  const action = typeof rawAction === 'string' && rawAction.trim().length > 0 ? rawAction.trim() : null;
  const command = typeof rawCommand === 'string' && rawCommand.trim().length > 0 ? rawCommand.trim() : null;
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
  const hasError = status === 'error';
  const hasSuccess = status === 'completed';
  const isActive = status === 'pending' || status === 'in-progress';
  const isBlocked = hasError && (error?.includes('User rejected tool execution') ?? false);
  const label = isBlocked ? 'Blocked by user' : error;
  const { action, command, timeoutMs } = getBashArgs(args);
  const [open, setOpen] = React.useState(false);
  const outputText = getBashOutputText(result);
  const resultSummary = getBashResultSummary(status, result, label);
  const timeoutLabel = formatTimeoutLabel(timeoutMs);
  const actionLabel = action ?? 'Run a shell command';
  const commandPreview = command ? truncateText(command, 96) : 'Waiting for command...';
  const outputPreview = outputText ? truncateText(outputText.replace(/\s+/g, ' '), 180) : 'No output yet';

  return (
    <div
      className={cn(
        'my-2 w-full overflow-hidden rounded-lg border text-xs transition-colors',
        toolCallBorderClass({ hasError, isActive, hasSuccess }),
      )}
    >
      <div className="flex w-full items-center gap-2 bg-primary/5 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 flex-1 items-center gap-2 text-primary transition-colors hover:text-primary/90"
        >
          <StatusIcon status={status} />
          <span className="min-w-0 flex-1 truncate text-left text-sm leading-none font-medium">
            <span className="capitalize">{toolName}</span>
            <span className="text-primary/70"> / {actionLabel}</span>
          </span>
          <ChevronRightIcon className={cn('size-3 shrink-0 text-primary transition-transform', open && 'rotate-90')} />
        </button>
        {isActive && onAbort ? (
          <button
            type="button"
            onClick={onAbort}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            title="Stop running tool"
          >
            <SquareIcon className="size-3" />
            Stop
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="border-t border-border/40 px-3 py-2 text-xs">
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
        </div>
      ) : null}
    </div>
  );
}

function WriteToolBlock({ toolName, status, args, error }: { toolName: string; status: ToolCallStatus; args: unknown; error?: string }) {
  const hasError = status === 'error';
  const hasSuccess = status === 'completed';
  const isActive = status === 'pending' || status === 'in-progress';
  const isBlocked = hasError && (error?.includes('User rejected tool execution') ?? false);
  const label = isBlocked ? 'Blocked by user' : error;
  const filePath = getFilePathFromArgs(args);
  const displayPath = filePath ? truncateText(filePath) : 'Waiting for path...';
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timeoutId = setTimeout(() => setCopied(false), 1000);
    return () => clearTimeout(timeoutId);
  }, [copied]);

  return (
    <div
      className={cn(
        'my-2 w-full overflow-hidden rounded-lg border text-xs transition-colors',
        toolCallBorderClass({ hasError, isActive, hasSuccess }),
      )}
    >
      <div className="inline-flex w-full items-center gap-2 px-3 py-2">
        <StatusIcon status={status} />
        <span className="text-sm leading-none font-medium capitalize">{toolName}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {label ? `${displayPath} - ${label}` : displayPath}
        </span>
        {filePath ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(filePath).then(() => setCopied(true));
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
            title={copied ? 'Copied' : 'Copy file path'}
            aria-label={copied ? 'Copied' : 'Copy file path'}
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
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EditToolBlock({ toolName, status, args, error }: { toolName: string; status: ToolCallStatus; args: unknown; error?: string }) {
  const hasError = status === 'error';
  const hasSuccess = status === 'completed';
  const isActive = status === 'pending' || status === 'in-progress';
  const isBlocked = hasError && (error?.includes('User rejected tool execution') ?? false);
  const label = isBlocked ? 'Blocked by user' : error;
  const filePath = getFilePathFromArgs(args);
  const displayPath = filePath ? truncateText(filePath) : 'Waiting for path...';
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timeoutId = setTimeout(() => setCopied(false), 1000);
    return () => clearTimeout(timeoutId);
  }, [copied]);

  return (
    <div
      className={cn(
        'my-2 w-full overflow-hidden rounded-lg border text-xs transition-colors',
        toolCallBorderClass({ hasError, isActive, hasSuccess }),
      )}
    >
      <div className="inline-flex w-full items-center gap-2 px-3 py-2">
        <StatusIcon status={status} />
        <span className="text-sm leading-none font-medium capitalize">{toolName}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {label ? `${displayPath} - ${label}` : displayPath}
        </span>
        {filePath ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(filePath).then(() => setCopied(true));
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
            title={copied ? 'Copied' : 'Copy file path'}
            aria-label={copied ? 'Copied' : 'Copy file path'}
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
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ReadToolBlock({ toolName, status, args, error }: { toolName: string; status: ToolCallStatus; args: unknown; error?: string }) {
  const hasError = status === 'error';
  const hasSuccess = status === 'completed';
  const isActive = status === 'pending' || status === 'in-progress';
  const isBlocked = hasError && (error?.includes('User rejected tool execution') ?? false);
  const label = isBlocked ? 'Blocked by user' : error;
  const filePath = getFilePathFromArgs(args);
  const displayPath = filePath ? truncateText(filePath) : 'Waiting for path...';
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timeoutId = setTimeout(() => setCopied(false), 1000);
    return () => clearTimeout(timeoutId);
  }, [copied]);

  return (
    <div
      className={cn(
        'my-2 w-full overflow-hidden rounded-lg border text-xs transition-colors',
        toolCallBorderClass({ hasError, isActive, hasSuccess }),
      )}
    >
      <div className="inline-flex w-full items-center gap-2 px-3 py-2">
        <StatusIcon status={status} />
        <span className="text-sm leading-none font-medium capitalize">{toolName}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {label ? `${displayPath} - ${label}` : displayPath}
        </span>
        {filePath ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(filePath).then(() => setCopied(true));
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
            title={copied ? 'Copied' : 'Copy file path'}
            aria-label={copied ? 'Copied' : 'Copy file path'}
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
          </button>
        ) : null}
      </div>
    </div>
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

export function ToolCallBlock({ toolName, status, args, result, error, onAbort }: ToolCallBlockProps) {
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
      <WebfetchToolBlock toolName={toolName} status={status} args={args} error={error} onAbort={onAbort} />
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
    return <WriteToolBlock toolName={toolName} status={status} args={args} error={error} />;
  }

  if (isEdit) {
    return <EditToolBlock toolName={toolName} status={status} args={args} error={error} />;
  }

  if (isRead) {
    return <ReadToolBlock toolName={toolName} status={status} args={args} error={error} />;
  }

  return <GenericToolBlock toolName={toolName} status={status} error={error} />;
}
