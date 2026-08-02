import { cva, type VariantProps } from 'class-variance-authority';

import { textAlignClasses, textLineClampClasses, textToneClasses, textVariantClasses } from '@/styles/tokens.generated';
import type { ComponentPropsWithoutRef, ElementType } from 'react';

const TEXT_ELEMENTS = ['code', 'div', 'h1', 'h2', 'h3', 'label', 'p', 'span'] as const;
type TextElement = (typeof TEXT_ELEMENTS)[number];
type TextVariant = keyof typeof textVariantClasses;

const defaultElement: Record<TextVariant, TextElement> = {
  micro: 'span',
  caption: 'span',
  label: 'label',
  body: 'p',
  'body-strong': 'p',
  'heading-s': 'h3',
  'heading-m': 'h2',
  'heading-l': 'h1',
  code: 'code',
  metric: 'span',
};

const textVariants = cva('', {
  variants: {
    variant: textVariantClasses,
    tone: textToneClasses,
    truncate: { true: 'truncate', false: null },
    tabular: { true: 'tabular-nums', false: null },
    align: textAlignClasses,
    lineClamp: textLineClampClasses,
  },
  defaultVariants: { variant: 'body', tone: 'default', truncate: false, tabular: false },
});

type TextProps = Omit<ComponentPropsWithoutRef<TextElement>, 'as' | 'className' | 'style'> &
  VariantProps<typeof textVariants> & { as?: TextElement; className?: never; style?: never };

function Text({ as, variant = 'body', tone, truncate, tabular, align, lineClamp, ...props }: TextProps) {
  const resolvedVariant = variant ?? 'body';
  const Component = (as ?? defaultElement[resolvedVariant]) as ElementType;
  return (
    <Component
      className={textVariants({ variant: resolvedVariant, tone, truncate, tabular, align, lineClamp })}
      {...props}
    />
  );
}

export { Text, type TextProps };
