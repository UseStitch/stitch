import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';

import type { StoredPart } from '@stitch/shared/chat/messages';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { extractTextFromParts } from '@/components/chat/message-bubble/extract-text.js';
import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';

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
      <div className="flex items-center gap-space-l py-space-m">
        <div className="h-px flex-1 bg-border-subtle" />
        <Text as="span" variant="label" tone="muted">
          Session compacted
        </Text>
        <div className="h-px flex-1 bg-border-subtle" />
      </div>
    );
  }

  return (
    <details className="group">
      <summary
        aria-label="Session compacted"
        className="flex cursor-pointer list-none items-center gap-space-l py-space-m text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <div className="h-px flex-1 bg-border-subtle" />
        <span className="flex items-center gap-space-s">
          <span className="group-open:hidden">
            <Icon as={ChevronRightIcon} size="xs" />
          </span>
          <span className="hidden group-open:block">
            <Icon as={ChevronDownIcon} size="xs" />
          </span>
          <Text as="span" variant="label" tone="muted">
            Session compacted
          </Text>
        </span>
        <div className="h-px flex-1 bg-border-subtle" />
      </summary>
      <div className="w-full">
        <ChatMarkdown text={summaryText} />
      </div>
    </details>
  );
}
