import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const statusDotVariants = cva('inline-block shrink-0 rounded-full', {
  variants: {
    color: {
      success: 'bg-success',
      destructive: 'bg-destructive',
      warning: 'bg-warning',
      info: 'bg-info',
      primary: 'bg-primary',
      muted: 'bg-muted-foreground',
    },
    size: { sm: 'size-1.5', default: 'size-2' },
    pulse: { true: 'animate-pulse' },
    glow: { true: '' },
  },
  compoundVariants: [
    { glow: true, color: 'success', className: 'shadow-success-glow' },
    { glow: true, color: 'destructive', className: 'shadow-destructive-glow' },
    { glow: true, color: 'warning', className: 'shadow-warning-glow' },
    { glow: true, color: 'info', className: 'shadow-info-glow' },
  ],
  defaultVariants: { color: 'success', size: 'default' },
});

function StatusDot({
  className,
  color,
  size,
  pulse,
  glow,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof statusDotVariants>) {
  return (
    <span
      data-slot="status-dot"
      className={cn(statusDotVariants({ color, size, pulse, glow }), className)}
      {...props}
    />
  );
}

export { StatusDot, statusDotVariants };
