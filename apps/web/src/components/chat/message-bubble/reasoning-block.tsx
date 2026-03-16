import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';

type ReasoningBlockProps = {
  text: string;
  isStreaming?: boolean;
};

export function ReasoningBlock({ text, isStreaming }: ReasoningBlockProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border/40 bg-muted/25">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? (
          <ChevronDownIcon className="size-3.5 shrink-0" />
        ) : (
          <ChevronRightIcon className="size-3.5 shrink-0" />
        )}
        <span className="font-medium">{isStreaming ? 'Thinking...' : 'Reasoning'}</span>
        {isStreaming && (
          <span className="ml-auto inline-block h-1.5 w-1.5 rounded-full bg-info animate-pulse" />
        )}
      </button>
      {open && (
        <div className="border-t border-border/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground italic">
          {text}
        </div>
      )}
    </div>
  );
}
