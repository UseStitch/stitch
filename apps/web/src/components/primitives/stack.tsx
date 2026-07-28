import { cva, type VariantProps } from 'class-variance-authority';

import {
  stackAlignVariants,
  stackDirectionVariants,
  stackGapVariants,
  stackGrowVariants,
  stackHeightVariants,
  stackJustifyVariants,
  stackOverflowVariants,
  stackPaddingVariants,
  stackWidthVariants,
  stackWrapVariants,
} from '@/styles/tokens.generated';
import type { ComponentPropsWithRef, ElementType } from 'react';

const stackVariants = cva('flex', {
  variants: {
    direction: stackDirectionVariants,
    gap: stackGapVariants,
    align: stackAlignVariants,
    justify: stackJustifyVariants,
    padding: stackPaddingVariants,
    wrap: stackWrapVariants,
    grow: stackGrowVariants,
    width: stackWidthVariants,
    height: stackHeightVariants,
    overflow: stackOverflowVariants,
  },
  defaultVariants: { direction: 'column', wrap: false },
});

const STACK_ELEMENTS = [
  'div',
  'section',
  'nav',
  'main',
  'aside',
  'header',
  'footer',
  'form',
  'ul',
  'ol',
  'li',
] as const;
type StackElement = (typeof STACK_ELEMENTS)[number];
type StackProps<T extends StackElement = 'div'> = Omit<ComponentPropsWithRef<T>, 'as' | 'className' | 'style'> &
  VariantProps<typeof stackVariants> & { as?: T; className?: never; style?: never };

function Stack<T extends StackElement = 'div'>({
  as,
  direction,
  gap,
  align,
  justify,
  padding,
  wrap,
  grow,
  width,
  height,
  overflow,
  ...props
}: StackProps<T>) {
  const Component = (as ?? 'div') as ElementType;
  return (
    <Component
      className={stackVariants({ direction, gap, align, justify, padding, wrap, grow, width, height, overflow })}
      {...props}
    />
  );
}

export { Stack, type StackProps };
