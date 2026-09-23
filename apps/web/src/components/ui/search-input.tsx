import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cnfast';
import { SearchIcon } from 'lucide-react';
import * as React from 'react';

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

const searchInputVariants = cva('', {
  variants: {
    variant: { default: '', filled: 'bg-background', sunken: 'border-border-subtle bg-surface-sunken shadow-inner' },
  },
  defaultVariants: { variant: 'default' },
});

type SearchInputProps = React.ComponentProps<typeof InputGroupInput> & { containerClassName?: string } & VariantProps<
    typeof searchInputVariants
  >;

function SearchInput({ className, containerClassName, variant = 'default', ...props }: SearchInputProps) {
  return (
    <InputGroup data-variant={variant} className={cn(containerClassName, searchInputVariants({ variant }))}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput className={className} {...props} />
    </InputGroup>
  );
}

export { SearchInput, searchInputVariants };
