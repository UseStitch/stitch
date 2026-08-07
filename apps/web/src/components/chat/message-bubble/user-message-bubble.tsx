import { cn } from 'cnfast';
import { FileIcon, FileTextIcon, GitForkIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, PencilIcon } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';

import type { StoredPart } from '@stitch/shared/chat/messages';

import ChatMarkdown from '@/components/chat/chat-markdown.js';
import { extractTextFromParts } from '@/components/chat/message-bubble/extract-text.js';
import { MESSAGE_ACTION_BUTTON_CLASS, MessageCopyButton } from '@/components/chat/message-bubble/shared-components.js';
import { Icon } from '@/components/primitives/icon.js';
import { Stack } from '@/components/primitives/stack.js';
import { Text } from '@/components/primitives/text.js';
import { Button } from '@/components/ui/button';

const COLLAPSED_MAX_HEIGHT = 150;

type UserMessageBubbleProps = { parts: StoredPart[]; onSplit?: () => void; onEdit?: () => void };

export function UserMessageBubble({ parts, onSplit, onEdit }: UserMessageBubbleProps) {
  const text = extractTextFromParts(parts);
  const imageParts = parts.filter((part): part is StoredPart & { type: 'user-image' } => part.type === 'user-image');
  const fileParts = parts.filter((part): part is StoredPart & { type: 'user-file' } => part.type === 'user-file');
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
      <div className="max-w-[85%] min-w-0 space-y-space-xs border-r-2 border-border-subtle pr-space-l">
        {hasAttachments && (
          <Stack direction="row" justify="end" gap="m" wrap>
            {imageParts.map((part) => (
              <div
                key={part.id}
                className="size-20 overflow-hidden rounded-lg border border-border-subtle bg-surface-sunken">
                {part.dataUrl ? (
                  <img src={part.dataUrl} alt={part.filename} className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <Icon as={FileIcon} size="l" color="var(--muted-foreground)" />
                  </div>
                )}
              </div>
            ))}
            {fileParts.map((part) => (
              <div
                key={part.id}
                className="flex h-8 max-w-48 items-center gap-space-s rounded-lg border border-border-subtle bg-surface-sunken px-space-m">
                <Icon as={FileIcon} size="s" color="var(--muted-foreground)" />
                <Text as="span" variant="caption" truncate>
                  {part.filename}
                </Text>
              </div>
            ))}
            {textFileParts.map((part) => (
              <div
                key={part.id}
                className="flex h-8 max-w-48 items-center gap-space-s rounded-lg border border-border-subtle bg-surface-sunken px-space-m">
                <Icon as={FileTextIcon} size="s" color="var(--muted-foreground)" />
                <Text as="span" variant="caption" truncate>
                  {part.filename}
                </Text>
              </div>
            ))}
          </Stack>
        )}

        {text && (
          <div className="relative">
            <div
              ref={contentRef}
              className={cn(
                'transition-[max-height] duration-base',
                !isExpanded && isOverflowing && 'max-h-37.5 overflow-y-auto thin-scrollbar',
              )}>
              <ChatMarkdown text={text} className="text-sm" />
            </div>

            {isOverflowing && (
              <Button
                type="button"
                variant="quiet"
                size="inline"
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-space-xs">
                {isExpanded ? (
                  <>
                    <Icon as={ChevronsDownUpIcon} size="xs" />
                    Collapse
                  </>
                ) : (
                  <>
                    <Icon as={ChevronsUpDownIcon} size="xs" />
                    Show more
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {text && (
        <div className="absolute right-0 -bottom-5 flex items-center gap-space-l opacity-0 transition-opacity group-hover:opacity-100">
          <MessageCopyButton text={text} />

          {onEdit && (
            <Button
              type="button"
              variant="quiet"
              size="inline"
              onClick={onEdit}
              aria-label="Edit and redo from here"
              className={MESSAGE_ACTION_BUTTON_CLASS}>
              <Icon as={PencilIcon} size="s" />
              Edit
            </Button>
          )}

          {onSplit && (
            <Button
              type="button"
              variant="quiet"
              size="inline"
              onClick={onSplit}
              aria-label="Split from here"
              className={MESSAGE_ACTION_BUTTON_CLASS}>
              <Icon as={GitForkIcon} size="s" />
              Split
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
