import { SearchIcon } from 'lucide-react';
import * as React from 'react';

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

type SearchInputProps = React.ComponentProps<typeof InputGroupInput> & { containerClassName?: string };

function SearchInput({ className, containerClassName, ...props }: SearchInputProps) {
  return (
    <InputGroup className={containerClassName}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput className={className} {...props} />
    </InputGroup>
  );
}

export { SearchInput };
