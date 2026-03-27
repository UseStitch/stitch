import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { CheckIcon, ChevronDownIcon, CpuIcon, SearchIcon } from 'lucide-react';
import * as React from 'react';

import type { ModelSpec } from './types';
import {
  buildProviderModelOptions,
  filterProviderModels,
  findProviderModelOption,
} from '@/components/model-selectors/provider-model-utils';
import type { ProviderModels } from '@/lib/queries/providers';
import { cn } from '@/lib/utils';

type ModelSelectorPopoverProps = {
  selectedValue: ModelSpec | null;
  onSelect: (value: ModelSpec) => void;
  providerModels: ProviderModels[];
};

export function ModelSelectorPopover({
  selectedValue,
  onSelect,
  providerModels,
}: ModelSelectorPopoverProps) {
  const [search, setSearch] = React.useState('');

  const allOptions = React.useMemo(
    () => buildProviderModelOptions(providerModels),
    [providerModels],
  );
  const filtered = React.useMemo(
    () => filterProviderModels(providerModels, search),
    [providerModels, search],
  );
  const selectedOption = React.useMemo(
    () => findProviderModelOption(allOptions, selectedValue),
    [allOptions, selectedValue],
  );

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        )}
      >
        <CpuIcon className="size-3.5 shrink-0" />
        <span>{selectedOption?.modelName ?? 'Select model'}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="top"
          sideOffset={6}
          align="start"
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            className={cn(
              'bg-popover text-popover-foreground rounded-lg shadow-lg ring-1 ring-foreground/10',
              'data-open:animate-in data-closed:animate-out',
              'data-closed:fade-out-0 data-open:fade-in-0',
              'data-closed:zoom-out-95 data-open:zoom-in-95',
              'data-[side=top]:slide-in-from-bottom-2',
              'w-96 max-h-80 flex flex-col origin-(--transform-origin) outline-none duration-100',
            )}
          >
            <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
              <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search models"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="no-scrollbar max-h-70 overflow-y-auto overscroll-contain">
              <div className="p-1">
                {filtered.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">No models found</p>
                )}
                {filtered.map((provider, index) => (
                  <div key={provider.providerId}>
                    {index > 0 && <div className="my-1 h-px bg-border/50" />}
                    <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      {provider.providerName}
                    </p>
                    {provider.models.map((model) => {
                      const isSelected =
                        selectedValue?.providerId === provider.providerId &&
                        selectedValue?.modelId === model.id;
                      return (
                        <PopoverPrimitive.Close
                          key={model.id}
                          onClick={() =>
                            onSelect({ providerId: provider.providerId, modelId: model.id })
                          }
                          className={cn(
                            'w-full flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-default',
                            'transition-colors hover:bg-accent hover:text-accent-foreground',
                            'focus-visible:outline-none focus-visible:bg-accent',
                            isSelected && 'font-medium',
                          )}
                        >
                          <span>{model.name}</span>
                          {isSelected && <CheckIcon className="size-3.5 shrink-0" />}
                        </PopoverPrimitive.Close>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
