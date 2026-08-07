import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2Icon } from 'lucide-react';

import { cn } from 'cnfast';

import { textToneClasses } from '@/styles/tokens';

const spinnerVariants = cva('animate-spin', {
  variants: { size: { sm: 'size-3.5', default: 'size-4', lg: 'size-8' }, tone: textToneClasses },
  defaultVariants: { size: 'default' },
});

function Spinner({
  className,
  size,
  tone,
  ...props
}: Omit<React.ComponentProps<typeof Loader2Icon>, 'size'> & VariantProps<typeof spinnerVariants>) {
  return <Loader2Icon data-slot="spinner" className={cn(spinnerVariants({ size, tone }), className)} {...props} />;
}

export { Spinner, spinnerVariants };
