import { BoxIcon } from 'lucide-react';
import * as React from 'react';

import { RemoteMaskedIcon } from '@/components/icons/remote-icon';
import { cn } from '@/lib/utils';

type SimpleIconProps = { slug: string; className?: string; fallback?: React.ReactNode };

export function SimpleIcon({ slug, className, fallback }: SimpleIconProps) {
  return (
    <RemoteMaskedIcon
      path={`/icons/simple-icons/${slug}`}
      label={slug}
      className={className}
      fallback={fallback ?? <BoxIcon className={cn('text-muted-foreground', className)} />}
    />
  );
}
