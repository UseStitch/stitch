import { Input as InputPrimitive } from '@base-ui/react/input';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cnfast';
import * as React from 'react';

const inputVariants = cva(
  'dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 h-8 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors file:h-6 file:text-sm file:font-medium focus-visible:ring-3 aria-invalid:ring-3 md:text-sm w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default: '',
        ghost: 'rounded-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0',
        title:
          'rounded-sm border-none bg-transparent text-xl font-semibold shadow-none ring-1 ring-primary focus-visible:ring-1 focus-visible:ring-primary',
        filled:
          'rounded-md border-border bg-background text-sm focus:ring-1 focus:ring-primary focus-visible:ring-1 focus-visible:ring-primary',
        sunken: 'h-7 rounded-sm border-border bg-surface-sunken text-xs focus:border-primary focus-visible:ring-0',
        compact: 'h-7 text-xs',
        code: 'font-mono text-xs',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Input({
  className,
  type,
  variant = 'default',
  ...props
}: React.ComponentProps<'input'> & VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-variant={variant}
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Input, inputVariants };
