import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';

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
  const raw = summaryParts ? extractTextFromParts(summaryParts) : '';
  const summaryText = stripOuterCodeFence(raw);
  const hasSummary = !!summaryText;

  if (!hasSummary) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="h-px flex-1 bg-border/60" />
        <span className="text-xs font-medium text-muted-foreground">Session compacted</span>
        <div className="h-px flex-1 bg-border/60" />
      </div>
    );
  }

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <div className="h-px flex-1 bg-border/60" />
        <span className="flex items-center gap-1.5">
          <ChevronRightIcon className="size-3 shrink-0 group-open:hidden" />
          <ChevronDownIcon className="hidden size-3 shrink-0 group-open:block" />
          Session compacted
        </span>
        <div className="h-px flex-1 bg-border/60" />
      </summary>
      <div className="w-full">
        <ChatMarkdown text={summaryText} />
      </div>
    </details>
  );
}
