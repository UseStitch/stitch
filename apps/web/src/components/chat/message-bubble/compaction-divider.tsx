import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';

import type { StoredPart } from '@openwork/shared';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { extractTextFromParts } from '@/components/chat/message-bubble/extract-text.js';

type CompactionDividerProps = {
  summaryParts?: StoredPart[];
};

export function CompactionDivider({ summaryParts }: CompactionDividerProps) {
  const [open, setOpen] = React.useState(false);

  const summaryText = summaryParts ? extractTextFromParts(summaryParts) : '';
  const hasSummary = !!summaryText;

  return (
    <div>
      <div className="flex items-center gap-3 py-2">
        <div className="h-px flex-1 bg-border/60" />
        {hasSummary ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium hover:text-foreground transition-colors"
          >
            {open ? (
              <ChevronDownIcon className="size-3 shrink-0" />
            ) : (
              <ChevronRightIcon className="size-3 shrink-0" />
            )}
            <span>Session compacted</span>
          </button>
        ) : (
          <span className="text-xs text-muted-foreground font-medium">Session compacted</span>
        )}
        <div className="h-px flex-1 bg-border/60" />
      </div>
      {open && hasSummary && (
        <div className="mt-2 rounded-lg border border-border/40 bg-muted/30 px-4 py-3">
          <ChatMarkdown text={summaryText} />
        </div>
      )}
    </div>
  );
}
