import { LinkIcon } from 'lucide-react';

import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';
import { Badge } from '@/components/ui/badge';

type SourceChipProps = { url: string; title?: string };

export function SourceChip({ url, title }: SourceChipProps) {
  return (
    <Badge
      variant="soft"
      className="mr-space-xs mb-space-m"
      render={<a href={url} target="_blank" rel="noopener noreferrer" aria-label={title ?? url} />}>
      <Icon as={LinkIcon} size="xs" />
      <span className="max-w-45">
        <Text as="span" variant="caption" truncate>
          {title ?? url}
        </Text>
      </span>
    </Badge>
  );
}
