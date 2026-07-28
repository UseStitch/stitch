import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';

import {
  stackAlignVariants,
  stackDirectionVariants,
  stackGapVariants,
  stackJustifyVariants,
  stackPaddingVariants,
  stackWrapVariants,
} from '@/styles/tokens.generated';

const stackVariants = cva('flex', {
  variants: {
    direction: stackDirectionVariants,
    gap: stackGapVariants,
    align: stackAlignVariants,
    justify: stackJustifyVariants,
    padding: stackPaddingVariants,
    wrap: stackWrapVariants,
  },
  defaultVariants: { direction: 'column', wrap: false },
});

type StackProps = Omit<ComponentPropsWithoutRef<'div'>, 'className'> &
  VariantProps<typeof stackVariants> & { className?: never };

function Stack({ direction, gap, align, justify, padding, wrap, ...props }: StackProps) {
  return <div className={stackVariants({ direction, gap, align, justify, padding, wrap })} {...props} />;
}

export { Stack };
