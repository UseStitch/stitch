import { BoxIcon } from 'lucide-react';

import type { ConnectorIconSource } from '@stitch/shared/connectors/types';

import { MaskedIcon } from '@/components/icons/masked-icon';
import { SimpleIcon } from '@/components/ui/simple-icon';
import { cn } from '@/lib/utils';

type ConnectorIconProps = {
  icon: ConnectorIconSource;
  className?: string;
};

export function ConnectorIcon({ icon, className }: ConnectorIconProps) {
  if (icon.type === 'simpleIcons') {
    return (
      <SimpleIcon
        slug={icon.slug}
        className={className}
        fallback={<BoxIcon className={cn('text-muted-foreground', className)} />}
      />
    );
  }

  const logoUrl = `data:image/svg+xml;utf8,${encodeURIComponent(icon.svgString)}`;

  return (
    <MaskedIcon src={logoUrl} label="connector icon" className={cn('bg-foreground', className)} />
  );
}
