import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';

const spinnerVariants = cva('animate-spin', {
  variants: { size: { sm: 'size-3.5', default: 'size-4', lg: 'size-8' } },
  defaultVariants: { size: 'default' },
});

function Spinner({
  className,
  size,
  ...props
}: Omit<React.ComponentProps<typeof Loader2Icon>, 'size'> & VariantProps<typeof spinnerVariants>) {
  return <Loader2Icon data-slot="spinner" className={cn(spinnerVariants({ size }), className)} {...props} />;
}

export { Spinner, spinnerVariants };
