import { FileIcon, FileTextIcon, XIcon } from 'lucide-react';

import type { Attachment } from './types';
import { cn } from '@/lib/utils';

type AttachmentPreviewProps = {
  attachment: Attachment;
  onRemove: (id: string) => void;
};

export function AttachmentPreview({ attachment, onRemove }: AttachmentPreviewProps) {
  const isImage = attachment.mime.startsWith('image/');
  const isPdf = attachment.mime === 'application/pdf';

  return (
    <div className="group relative shrink-0">
      {isImage && attachment.previewUrl ? (
        <div className="relative size-16 overflow-hidden rounded-lg border border-border/60 bg-muted">
          <img
            src={attachment.previewUrl}
            alt={attachment.filename}
            className="size-full object-cover"
          />
        </div>
      ) : (
        <div className="flex h-8 max-w-40 items-center gap-1.5 rounded-lg border border-border/60 bg-muted px-2.5">
          {isPdf ? (
            <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-xs text-muted-foreground">{attachment.filename}</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        className={cn(
          'absolute -top-1.5 -right-1.5 size-4 rounded-full',
          'bg-foreground text-background flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'focus-visible:opacity-100 focus-visible:outline-none',
        )}
      >
        <XIcon className="size-2.5" />
      </button>
    </div>
  );
}
