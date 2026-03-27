import { ChevronRightIcon } from 'lucide-react';
import * as React from 'react';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { cn } from '@/lib/utils';

import { ToolCard } from './card-primitives';

function QuestionAnswers({ args, result }: { args: unknown; result?: unknown }) {
  const questions = (args as { questions?: { question: string; header: string }[] })?.questions;
  const answers = (result as { answers?: (string[] | undefined)[] } | undefined)?.answers;

  if (!questions) return null;

  return (
    <div className="space-y-2">
      {questions.map((question, index) => {
        const answer = answers?.[index];
        const hasAnswer = answer !== undefined && answer.length > 0;
        return (
          <div key={question.header} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{question.question}</span>
            {hasAnswer ? (
              <span className="text-sm leading-relaxed font-medium text-foreground">
                {answer.join(', ')}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground/70 italic">Waiting for answer...</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

type QuestionToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args: unknown;
  result?: unknown;
};

export function QuestionToolBlock({ toolName, status, args, result }: QuestionToolBlockProps) {
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
