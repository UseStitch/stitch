import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cnfast';
import * as React from 'react';

const labelVariants = cva(
  'gap-2 text-sm leading-none font-medium group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50 flex items-center select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default: '',
        muted: 'text-xs text-muted-foreground',
        section: 'text-xs font-semibold text-muted-foreground uppercase',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Label({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'label'> & VariantProps<typeof labelVariants>) {
  return <label data-slot="label" className={cn(labelVariants({ variant }), className)} {...props} />;
}

export { Label, labelVariants };
