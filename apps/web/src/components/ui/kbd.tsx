import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const kbdVariants = cva(
  'inline-flex items-center justify-center rounded-md border border-border/60 bg-muted/40 font-medium text-foreground shadow-sm leading-none',
  {
    variants: { size: { default: 'px-1.5 py-0.5 text-xs', sm: 'px-1.5 py-0.5 text-2xs' } },
    defaultVariants: { size: 'default' },
  },
);

function Kbd({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'kbd'> & VariantProps<typeof kbdVariants>) {
  return <kbd data-slot="kbd" className={cn(kbdVariants({ size }), className)} {...props} />;
}

export { Kbd, kbdVariants };
