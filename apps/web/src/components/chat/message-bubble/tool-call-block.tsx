import {
  ChevronDownIcon,
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
      return <LoaderIcon className="mt-0.5 size-3.5 shrink-0 text-blue-500 animate-spin" />;
    case 'completed':
      return <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />;
    case 'error':
      return <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
  }
}

function QuestionAnswers({ args, result }: { args: unknown; result?: unknown }) {
  const questions = (args as { questions?: { question: string; header: string }[] })?.questions;
  const answers = (result as { answers?: (string[] | undefined)[] } | undefined)?.answers;

  if (!questions) return null;

  return (
    <div className="mt-1.5 space-y-1.5">
      {questions.map((q, i) => {
        const answer = answers?.[i];
        const hasAnswer = answer !== undefined && answer.length > 0;
        return (
          <div key={q.header} className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">{q.question}</span>
            {hasAnswer ? (
              <span className="font-medium text-foreground">{answer.join(', ')}</span>
            ) : (
              <span className="italic text-muted-foreground/60">Waiting for answer...</span>
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
};

function toolCallBorderClass({ hasError, isActive }: ToolCallBlockClasses) {
  if (hasError) return 'border-destructive/40 bg-destructive/5';
  if (isActive) return 'border-blue-500/30 bg-blue-500/5';
  return 'border-border/40 bg-muted/20';
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
  const isActive = status === 'pending' || status === 'in-progress';

  return (
    <div
      className={cn(
        'my-2 rounded-lg border text-xs transition-colors overflow-hidden',
        toolCallBorderClass({ hasError, isActive }),
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-muted/40 transition-colors"
      >
        {open ? (
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
        )}
        <StatusIcon status={status} />
        <span className="font-medium">{toolName}</span>
      </button>
      {open && (
        <div className="border-t border-border/40 px-3 py-2">
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
  const isActive = status === 'pending' || status === 'in-progress';
  const isBlocked = hasError && (error?.includes('User rejected tool execution') ?? false);
  const label = isBlocked ? 'Blocked by user' : error;

  return (
    <div
      className={cn(
        'my-2 inline-flex flex-col items-start gap-1 rounded-lg border px-3 py-1.5 text-xs transition-colors',
        toolCallBorderClass({ hasError, isActive }),
      )}
    >
      <div className="inline-flex items-center gap-2">
        <StatusIcon status={status} />
        <span className="font-medium">{toolName}</span>
      </div>
      {label ? <span className="text-muted-foreground">{label}</span> : null}
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
