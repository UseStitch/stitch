import { FileIcon, FileTextIcon, XIcon } from 'lucide-react';

import type { Attachment } from './types';
import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AttachmentPreviewProps = { attachment: Attachment; onRemove: (id: string) => void };

export function AttachmentPreview({ attachment, onRemove }: AttachmentPreviewProps) {
  const isImage = attachment.mime.startsWith('image/');
  const isPdf = attachment.mime === 'application/pdf';

  return (
    <div className="group relative shrink-0">
      {isImage && attachment.previewUrl ? (
        <div className="relative size-16 overflow-hidden rounded-lg border border-border-subtle bg-muted">
          <img src={attachment.previewUrl} alt={attachment.filename} className="size-full object-cover" />
        </div>
      ) : (
        <div className="flex h-8 max-w-40 items-center gap-space-s rounded-lg border border-border-subtle bg-muted px-space-m">
          {isPdf ? (
            <Icon as={FileIcon} size="s" color="var(--muted-foreground)" />
          ) : (
            <Icon as={FileTextIcon} size="s" color="var(--muted-foreground)" />
          )}
          <Text as="span" variant="caption" tone="muted" truncate>
            {attachment.filename}
          </Text>
        </div>
      )}
      <Button
        type="button"
        variant="destructive"
        size="icon-xs"
        onClick={() => onRemove(attachment.id)}
        className={cn(
          'absolute -top-1.5 -right-1.5 size-4 rounded-full',
          'bg-foreground text-background flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'focus-visible:opacity-100 focus-visible:outline-none',
        )}>
        <Icon as={XIcon} size="xs" />
      </Button>
    </div>
  );
}
