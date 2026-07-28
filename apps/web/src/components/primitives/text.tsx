import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ElementType } from 'react';

import { textToneClasses, textVariantClasses } from '@/styles/tokens.generated';

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
  },
  defaultVariants: { variant: 'body', tone: 'default', truncate: false, tabular: false },
});

type TextProps = Omit<ComponentPropsWithoutRef<TextElement>, 'as' | 'className'> &
  VariantProps<typeof textVariants> & {
    as?: TextElement;
    className?: never;
  };

function Text({ as, variant = 'body', tone, truncate, tabular, ...props }: TextProps) {
  const resolvedVariant = variant ?? 'body';
  const Component = (as ?? defaultElement[resolvedVariant]) as ElementType;
  return <Component className={textVariants({ variant: resolvedVariant, tone, truncate, tabular })} {...props} />;
}

export { Text, type TextProps };
