import { FileIcon, FileTextIcon, GitForkIcon } from 'lucide-react';

import type { StoredPart } from '@stitch/shared/chat/messages';

import { extractTextFromParts } from '@/components/chat/message-bubble/extract-text.js';
import {
  MESSAGE_ACTION_BUTTON_CLASS,
  MessageCopyButton,
} from '@/components/chat/message-bubble/shared-components.js';
import { Button } from '@/components/ui/button';

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

  return (
    <div className="group flex justify-end">
      <div className="max-w-[80%] space-y-2">
        {hasAttachments && (
          <div className="flex flex-wrap justify-end gap-2">
            {imageParts.map((part) => (
              <div
                key={part.id}
                className="size-20 overflow-hidden rounded-lg border border-white/20 bg-primary/20 shadow-sm"
              >
                {part.dataUrl ? (
                  <img src={part.dataUrl} alt={part.filename} className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <FileIcon className="size-5 text-primary-foreground/50" />
                  </div>
                )}
              </div>
            ))}
            {fileParts.map((part) => (
              <div
                key={part.id}
                className="flex h-8 max-w-48 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/20 px-2.5"
              >
                <FileIcon className="size-3.5 shrink-0 text-primary-foreground/70" />
                <span className="truncate text-xs text-primary-foreground/90">{part.filename}</span>
              </div>
            ))}
            {textFileParts.map((part) => (
              <div
                key={part.id}
                className="flex h-8 max-w-48 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/20 px-2.5"
              >
                <FileTextIcon className="size-3.5 shrink-0 text-primary-foreground/70" />
                <span className="truncate text-xs text-primary-foreground/90">{part.filename}</span>
              </div>
            ))}
          </div>
        )}

        {text && (
          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
            <p className="whitespace-pre-wrap">{text}</p>
          </div>
        )}

        {text && (
          <div className="flex items-center justify-end gap-3 opacity-0 transition-opacity group-hover:opacity-100">
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
    </div>
  );
}
