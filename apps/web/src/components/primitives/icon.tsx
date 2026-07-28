import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentType, SVGProps } from 'react';

import { iconSizeClasses } from '@/styles/tokens.generated';

const iconVariants = cva('shrink-0', {
  variants: {
    size: iconSizeClasses,
  },
  defaultVariants: { size: 'm' },
});

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type IconProps = Omit<SVGProps<SVGSVGElement>, 'className'> &
  VariantProps<typeof iconVariants> & {
    as: IconComponent;
    className?: never;
  };

function Icon({ as: Component, size, ...props }: IconProps) {
  return <Component className={iconVariants({ size })} {...props} />;
}

export { Icon };
