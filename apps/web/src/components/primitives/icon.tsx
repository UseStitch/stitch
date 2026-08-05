import { cva, type VariantProps } from 'class-variance-authority';

import { iconSizeClasses, textToneClasses } from '@/styles/tokens';
import type { ComponentType, SVGProps } from 'react';

const iconVariants = cva('shrink-0', {
  variants: { size: iconSizeClasses, tone: textToneClasses },
  defaultVariants: { size: 'm' },
});

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type IconProps = Omit<SVGProps<SVGSVGElement>, 'className' | 'style'> &
  VariantProps<typeof iconVariants> & { as: IconComponent; className?: never; style?: never };

function Icon({ as: Component, size, tone, ...props }: IconProps) {
  return <Component className={iconVariants({ size, tone })} {...props} />;
}

export { Icon };
