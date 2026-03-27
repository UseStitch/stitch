import * as React from 'react';

import type { PrefixedString } from '@stitch/shared/id';

import { ChatInputInner } from '@/components/chat/chat-input-parts/chat-input-inner';
import type { Attachment, ModelSpec } from '@/components/chat/chat-input-parts/types';
import { cn } from '@/lib/utils';

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string, attachments: Attachment[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  selectedModel: ModelSpec | null;
  onModelChange: (value: ModelSpec | null) => void;
  selectedAgent: string | null;
  onAgentChange: (value: PrefixedString<'agt'> | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  hasDockAbove?: boolean;
  embedded?: boolean;
  mode?: 'send' | 'queue';
  pendingAttachments?: Attachment[];
  onPendingAttachmentsConsumed?: () => void;
};

export function ChatInput({ className, hasDockAbove, embedded, ...props }: ChatInputProps) {
  return (
    <div className={cn('w-full', className)}>
      <React.Suspense
        fallback={
          <div
            className={cn(
              'relative flex flex-col rounded-2xl border border-border/60 bg-card shadow-sm',
              embedded && 'rounded-none border-0 bg-transparent shadow-none',
              hasDockAbove && !embedded && 'rounded-t-none border-t-0',
            )}
          >
            <div className="px-4 pt-4 pb-2">
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            </div>
            <div className="flex items-center justify-between px-3 pt-1 pb-3">
              <div className="h-6 w-24 animate-pulse rounded bg-muted" />
              <div className="size-6 animate-pulse rounded bg-muted" />
            </div>
          </div>
        }
      >
        <ChatInputInner hasDockAbove={hasDockAbove} embedded={embedded} {...props} />
      </React.Suspense>
    </div>
  );
}
