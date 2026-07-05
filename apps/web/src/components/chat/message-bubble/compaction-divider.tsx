import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';

import type { StoredPart } from '@stitch/shared/chat/messages';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { extractTextFromParts } from '@/components/chat/message-bubble/extract-text.js';

type CompactionDividerProps = { summaryParts?: StoredPart[] };

function stripOuterCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:\w*\n)?([\s\S]*?)```$/);
  return match ? (match[1]?.trim() ?? trimmed) : trimmed;
}

export function CompactionDivider({ summaryParts }: CompactionDividerProps) {
  const [open, setOpen] = React.useState(false);

  const raw = summaryParts ? extractTextFromParts(summaryParts) : '';
  const summaryText = stripOuterCodeFence(raw);
  const hasSummary = !!summaryText;

  return (
    <div>
      <div className="flex items-center gap-3 py-2">
        <div className="h-px flex-1 bg-border/60" />
        {hasSummary ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            {open ? <ChevronDownIcon className="size-3 shrink-0" /> : <ChevronRightIcon className="size-3 shrink-0" />}
            <span>Session compacted</span>
          </button>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">Session compacted</span>
        )}
        <div className="h-px flex-1 bg-border/60" />
      </div>
      {open && hasSummary && (
        <div className="w-full">
          <ChatMarkdown text={summaryText} />
        </div>
      )}
    </div>
  );
}
