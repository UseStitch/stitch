import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cnfast';
import * as React from 'react';

const textareaVariants = cva(
  'border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 rounded-lg border bg-transparent px-2.5 py-2 text-base transition-colors focus-visible:ring-3 aria-invalid:ring-3 md:text-sm flex field-sizing-content min-h-16 w-full outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default: '',
        ghost:
          'rounded-none border-0 bg-transparent text-sm leading-relaxed shadow-none thin-scrollbar placeholder:text-text-faint focus-visible:ring-0 disabled:bg-transparent',
        mono: 'font-mono text-sm thin-scrollbar',
      },
      size: { default: '', sm: 'text-xs' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Textarea({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: React.ComponentProps<'textarea'> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      data-variant={variant}
      data-size={size}
      className={cn(textareaVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Textarea, textareaVariants };
