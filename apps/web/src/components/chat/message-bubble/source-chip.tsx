import { LinkIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

type SourceChipProps = { url: string; title?: string };

export function SourceChip({ url, title }: SourceChipProps) {
  return (
    <Badge variant="soft" className="mr-1 mb-2" render={<a href={url} target="_blank" rel="noopener noreferrer" />}>
      <LinkIcon className="size-2.5 shrink-0" />
      <span className="max-w-45 truncate">{title ?? url}</span>
    </Badge>
  );
}
