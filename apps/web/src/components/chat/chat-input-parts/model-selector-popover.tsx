import { CheckIcon, ChevronDownIcon, CpuIcon, SearchIcon } from 'lucide-react';
import * as React from 'react';

import type { ModelSpec } from './types';
import {
  buildProviderModelOptions,
  filterProviderModels,
  findProviderModelOption,
} from '@/components/model-selectors/provider-model-utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ProviderModels } from '@/lib/queries/providers';
import { cn } from '@/lib/utils';

type ModelSelectorPopoverProps = {
  selectedValue: ModelSpec | null;
  onSelect: (value: ModelSpec) => void;
  providerModels: ProviderModels[];
};

export function ModelSelectorPopover({ selectedValue, onSelect, providerModels }: ModelSelectorPopoverProps) {
  const [search, setSearch] = React.useState('');

  const allOptions = buildProviderModelOptions(providerModels);
  const filtered = filterProviderModels(providerModels, search);
  const selectedOption = findProviderModelOption(allOptions, selectedValue);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-accent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        )}>
        <CpuIcon className="size-3.5 shrink-0" />
        <span>{selectedOption?.modelName ?? 'Select model'}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>

      <PopoverContent
        side="top"
        sideOffset={6}
        align="start"
        className="max-h-80 w-96 gap-0 p-0 shadow-lg outline-none">
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search models"
            className="h-auto flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-sm focus-visible:ring-0 dark:bg-transparent"
          />
        </div>

        <div className="no-scrollbar max-h-70 overflow-y-auto overscroll-contain">
          <div className="p-1">
            {filtered.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No models found</p>}
            {filtered.map((provider, index) => (
              <div key={provider.providerId}>
                {index > 0 && <div className="my-1 h-px bg-border-subtle" />}
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{provider.providerName}</p>
                {provider.models.map((model) => {
                  const isSelected =
                    selectedValue?.providerId === provider.providerId && selectedValue?.modelId === model.id;
                  return (
                    <PopoverClose
                      key={model.id}
                      onClick={() => onSelect({ providerId: provider.providerId, modelId: model.id })}
                      className={cn(
                        'w-full flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-default',
                        'transition-colors hover:bg-accent hover:text-accent-foreground',
                        'focus-visible:outline-none focus-visible:bg-accent',
                        isSelected && 'font-medium',
                      )}>
                      <span>{model.name}</span>
                      {isSelected && <CheckIcon className="size-3.5 shrink-0" />}
                    </PopoverClose>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
