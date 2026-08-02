import { FileIcon, FileTextIcon, XIcon } from 'lucide-react';

import type { Attachment } from './types';
import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';
import { Button } from '@/components/ui/button';

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
      <span className="absolute -top-1.5 -right-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button type="button" variant="destructive" size="icon-xs" onClick={() => onRemove(attachment.id)}>
          <Icon as={XIcon} size="xs" />
        </Button>
      </span>
    </div>
  );
}
