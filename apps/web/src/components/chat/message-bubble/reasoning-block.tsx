import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

type ReasoningBlockProps = { text: string; isStreaming?: boolean };

export function ReasoningBlock({ text, isStreaming }: ReasoningBlockProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border/40 bg-muted/25">
      <Button
        variant="ghost"
        onClick={() => setOpen((o) => !o)}
        className="h-auto w-full justify-start gap-2 rounded-none px-3 py-2 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground">
        {open ? <ChevronDownIcon className="size-3.5 shrink-0" /> : <ChevronRightIcon className="size-3.5 shrink-0" />}
        <span className="font-medium">{isStreaming ? 'Thinking...' : 'Reasoning'}</span>
        {isStreaming && <StatusDot color="info" size="sm" pulse className="ml-auto" />}
      </Button>
      {open && (
        <div className="border-t border-border/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground italic">
          {text}
        </div>
      )}
    </div>
  );
}
