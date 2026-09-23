import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cnfast';
import { BoxIcon } from 'lucide-react';

import type { ConnectorIconSource } from '@stitch/shared/connectors/types';

import { MaskedIcon } from '@/components/icons/masked-icon';
import { SimpleIcon } from '@/components/ui/simple-icon';

const connectorIconVariants = cva('', {
  variants: {
    tone: { default: '', muted: 'bg-muted-foreground', success: 'bg-success', destructive: 'bg-destructive' },
  },
  defaultVariants: { tone: 'default' },
});

type ConnectorIconProps = { icon: ConnectorIconSource; className?: string } & VariantProps<
  typeof connectorIconVariants
>;

export function ConnectorIcon({ icon, tone = 'default', className }: ConnectorIconProps) {
  const toneClass = connectorIconVariants({ tone });
  if (icon.type === 'simpleIcons') {
    return (
      <SimpleIcon
        slug={icon.slug}
        className={cn(toneClass, className)}
        fallback={<BoxIcon className={cn('text-muted-foreground', className)} />}
      />
    );
  }

  const logoUrl = `data:image/svg+xml;utf8,${encodeURIComponent(icon.svgString)}`;

  return <MaskedIcon src={logoUrl} label="connector icon" className={cn('bg-foreground', toneClass, className)} />;
}
