import {
  ChevronRightIcon,
  CheckIcon,
  AlertCircleIcon,
  LoaderIcon,
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

type ToolCallBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args?: unknown;
  result?: unknown;
  error?: string;
};

export function ToolCallBlock({ toolName, status, args, result, error }: ToolCallBlockProps) {
  const isQuestion = toolName === 'question' && args !== undefined && args !== null;

  if (isQuestion) {
    return <QuestionToolBlock toolName={toolName} status={status} args={args} result={result} />;
  }

  return <GenericToolBlock toolName={toolName} status={status} error={error} />;
}
