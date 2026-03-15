import * as React from 'react';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';

type ReasoningBlockProps = {
  text: string;
  isStreaming?: boolean;
};

export function ReasoningBlock({ text, isStreaming }: ReasoningBlockProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="my-3 rounded-lg border border-border/40 bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? (
          <ChevronDownIcon className="size-3.5 shrink-0" />
        ) : (
          <ChevronRightIcon className="size-3.5 shrink-0" />
        )}
        <span className="font-medium">{isStreaming ? 'Thinking...' : 'Reasoning'}</span>
        {isStreaming && (
          <span className="ml-auto inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
        )}
      </button>
      {open && (
        <div className="border-t border-border/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground italic">
          {text}
        </div>
      )}
    </div>
  );
}
