import {
  FileIcon,
  FileTextIcon,
  GitForkIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
} from 'lucide-react';
import { useRef, useState, useEffect } from 'react';

import type { StoredPart } from '@stitch/shared/chat/messages';

import ChatMarkdown from '@/components/chat/chat-markdown.js';
import { extractTextFromParts } from '@/components/chat/message-bubble/extract-text.js';
import {
  MESSAGE_ACTION_BUTTON_CLASS,
  MessageCopyButton,
} from '@/components/chat/message-bubble/shared-components.js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const COLLAPSED_MAX_HEIGHT = 150;

type UserMessageBubbleProps = {
  parts: StoredPart[];
  onSplit?: () => void;
};

export function UserMessageBubble({ parts, onSplit }: UserMessageBubbleProps) {
  const text = extractTextFromParts(parts);
  const imageParts = parts.filter(
    (part): part is StoredPart & { type: 'user-image' } => part.type === 'user-image',
  );
  const fileParts = parts.filter(
    (part): part is StoredPart & { type: 'user-file' } => part.type === 'user-file',
  );
  const textFileParts = parts.filter(
    (part): part is StoredPart & { type: 'user-text-file' } => part.type === 'user-text-file',
  );

  const hasAttachments = imageParts.length > 0 || fileParts.length > 0 || textFileParts.length > 0;

  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      setIsOverflowing(el.scrollHeight > COLLAPSED_MAX_HEIGHT);
    }
  }, [text]);

  return (
    <div className="group relative flex justify-end">
      <div className="max-w-[85%] min-w-0 space-y-1 border-r-2 border-foreground/20 pr-3">
        {hasAttachments && (
          <div className="flex flex-wrap justify-end gap-2">
            {imageParts.map((part) => (
              <div
                key={part.id}
                className="size-20 overflow-hidden rounded-lg border border-border/50 bg-muted/50"
              >
                {part.dataUrl ? (
                  <img src={part.dataUrl} alt={part.filename} className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <FileIcon className="size-5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            {fileParts.map((part) => (
              <div
                key={part.id}
                className="flex h-8 max-w-48 items-center gap-1.5 rounded-lg border border-border/50 bg-muted/50 px-2.5"
              >
                <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs text-foreground/80">{part.filename}</span>
              </div>
            ))}
            {textFileParts.map((part) => (
              <div
                key={part.id}
                className="flex h-8 max-w-48 items-center gap-1.5 rounded-lg border border-border/50 bg-muted/50 px-2.5"
              >
                <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs text-foreground/80">{part.filename}</span>
              </div>
            ))}
          </div>
        )}

        {text && (
          <div className="relative">
            <div
              ref={contentRef}
              className={cn(
                'transition-[max-height] duration-200',
                !isExpanded && isOverflowing && 'max-h-37.5 overflow-y-auto thin-scrollbar',
              )}
            >
              <ChatMarkdown text={text} className="text-sm" />
            </div>

            {isOverflowing && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-1 h-auto gap-1 px-0 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? (
                  <>
                    <ChevronsDownUpIcon className="size-3" />
                    Collapse
                  </>
                ) : (
                  <>
                    <ChevronsUpDownIcon className="size-3" />
                    Show more
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {text && (
        <div className="absolute right-0 -bottom-5 flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100">
          <MessageCopyButton text={text} />

          {onSplit && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onSplit}
              aria-label="Split from here"
              className={MESSAGE_ACTION_BUTTON_CLASS}
            >
              <GitForkIcon className="size-3.5" />
              Split
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
